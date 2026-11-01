"""GitHub-only HTTPS acquisition. No credentials, refs, user hosts or redirects."""

import ipaddress
import re
import socket
import time
from collections.abc import Callable

import httpx

from .config import Settings
from .errors import PipelineError
from .ingestion import Collection, collect_zip

URL_PATTERN = re.compile(
    r"https://github\.com/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))/([A-Za-z0-9_.-]{1,100})(?:/)?\Z"
)


def parse_github_url(url: str) -> tuple[str, str]:
    match = URL_PATTERN.fullmatch(url)
    if not match:
        raise PipelineError(
            "invalid_github_url",
            "Use https://github.com/owner/repository without credentials, query, port or ref",
        )
    owner, repo = match.groups()
    repo = repo.removesuffix(".git")
    if repo in {"", ".", ".."}:
        raise PipelineError("invalid_github_url", "Invalid repository name")
    return owner, repo


def public_dns(host: str) -> str:
    try:
        addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    except OSError as exc:
        raise PipelineError("github_network", "GitHub DNS lookup failed", 502) from exc
    if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
        raise PipelineError("unsafe_destination", "GitHub resolved to a non-public address")
    return addresses[0][4][0]


class PinnedGitHubTransport(httpx.BaseTransport):
    """Connect to the validated IP while retaining GitHub TLS SNI and Host."""

    def __init__(self):
        self.transport = httpx.HTTPTransport(retries=0)

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        host = request.url.host
        if host not in {"api.github.com", "codeload.github.com"} or request.url.scheme != "https":
            raise PipelineError("unsafe_destination", "GitHub HTTPS hosts only")
        address = public_dns(host)
        pinned = httpx.Request(
            request.method,
            request.url.copy_with(host=address),
            headers={**dict(request.headers), "host": host},
            stream=request.stream,
            extensions={**request.extensions, "sni_hostname": host},
        )
        return self.transport.handle_request(pinned)

    def close(self):
        self.transport.close()


class GitHubClient:
    def __init__(
        self,
        settings: Settings,
        client: httpx.Client | None = None,
        resolver: Callable[[str], None] = public_dns,
    ):
        self.settings = settings
        self.client = client
        self.resolver = resolver

    def _get(self, client: httpx.Client, url: str, max_bytes: int) -> bytes:
        host = httpx.URL(url).host
        if host not in {"api.github.com", "codeload.github.com"}:
            raise PipelineError("unsafe_destination", "Destination is not an allowed GitHub host")
        self.resolver(host)
        start = time.monotonic()
        try:
            with client.stream(
                "GET",
                url,
                follow_redirects=False,
                headers={
                    "Accept": "application/vnd.github+json",
                    "Accept-Encoding": "identity",
                    "User-Agent": "CodeAtlas-Phase-I",
                },
            ) as response:
                if 300 <= response.status_code < 400:
                    raise PipelineError("unsafe_redirect", "GitHub redirects are rejected")
                if response.status_code == 429 or (
                    response.status_code == 403 and response.headers.get("x-ratelimit-remaining") == "0"
                ):
                    raise PipelineError("github_rate_limit", "GitHub rate limit reached; retry later", 429)
                if response.status_code != 200:
                    raise PipelineError(
                        "github_response", f"GitHub returned HTTP {response.status_code}", 502
                    )
                if response.headers.get("content-encoding", "identity") not in {"", "identity"}:
                    raise PipelineError("github_encoding", "Unexpected compressed HTTP response")
                declared = response.headers.get("content-length")
                if declared and (not declared.isdigit() or int(declared) > max_bytes):
                    raise PipelineError("download_limit", "GitHub response exceeds download limit", 413)
                chunks, count = [], 0
                for chunk in response.iter_bytes(chunk_size=65536):
                    count += len(chunk)
                    if count > max_bytes:
                        raise PipelineError("download_limit", "GitHub response exceeds download limit", 413)
                    if time.monotonic() - start > self.settings.network_timeout_seconds:
                        raise PipelineError("github_timeout", "GitHub download deadline exceeded", 504)
                    chunks.append(chunk)
                return b"".join(chunks)
        except httpx.TimeoutException as exc:
            raise PipelineError("github_timeout", "GitHub request timed out", 504) from exc
        except httpx.HTTPError as exc:
            raise PipelineError("github_network", "GitHub request failed", 502) from exc

    def acquire(self, url: str) -> tuple[Collection, str, str]:
        import json

        owner, repo = parse_github_url(url)
        owned_client = self.client is None
        client = self.client or httpx.Client(
            timeout=self.settings.network_timeout_seconds, trust_env=False, transport=PinnedGitHubTransport()
        )
        try:
            metadata = self._get(client, f"https://api.github.com/repos/{owner}/{repo}", 1024 * 1024)
            try:
                meta = json.loads(metadata)
                if meta.get("private") is not False:
                    raise PipelineError("private_repository", "Only public GitHub repositories are supported")
                branch = meta["default_branch"]
                if not isinstance(branch, str) or not branch or len(branch) > 200:
                    raise ValueError("branch")
                from urllib.parse import quote

                commit_data = json.loads(
                    self._get(
                        client,
                        f"https://api.github.com/repos/{owner}/{repo}/commits/{quote(branch, safe='')}",
                        1024 * 1024,
                    )
                )
                sha = commit_data["sha"]
                if not isinstance(sha, str) or not re.fullmatch(r"[a-f0-9]{40}", sha):
                    raise ValueError("sha")
            except (ValueError, KeyError, TypeError, AttributeError) as exc:
                raise PipelineError(
                    "github_metadata", "GitHub returned invalid repository metadata", 502
                ) from exc
            archive = self._get(
                client,
                f"https://codeload.github.com/{owner}/{repo}/zip/{sha}",
                self.settings.max_download_bytes,
            )
            return (
                collect_zip(archive, self.settings, strip_root=True),
                sha,
                f"https://github.com/{owner}/{repo}",
            )
        finally:
            if owned_client:
                client.close()
