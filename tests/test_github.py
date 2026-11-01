import socket

import httpx
import pytest

from backend.codeatlas.errors import PipelineError
from backend.codeatlas.github import GitHubClient, PinnedGitHubTransport, parse_github_url, public_dns
from tests.conftest import zip_bytes

SHA = "a" * 40


@pytest.mark.parametrize(
    "url",
    [
        "http://github.com/a/b",
        "https://127.0.0.1/a/b",
        "https://github.com.evil/a/b",
        "https://github.com@evil.com/a/b",
        "https://github.com:443/a/b",
        "https://github.com/a/b?x=1",
        "https://github.com/a/b/tree/main",
        "file:///etc/passwd",
        "https://github.com/a/..",
        "https://github.com/a/b#x",
    ],
)
def test_invalid_urls(url):
    with pytest.raises(PipelineError):
        parse_github_url(url)


def test_valid_url_and_commit_acquisition(settings):
    calls = []

    def respond(request):
        calls.append(str(request.url))
        if request.url.host == "codeload.github.com":
            assert request.url.path.endswith(SHA)
            return httpx.Response(
                200,
                content=zip_bytes(
                    {
                        "repo-commit/a.py": b"x=1",
                        "repo-commit/A.java": b"class A {}",
                        "repo-commit/LICENSE": b"fixture",
                    }
                ),
            )
        if "/commits/" in request.url.path:
            return httpx.Response(200, json={"sha": SHA})
        return httpx.Response(200, json={"private": False, "default_branch": "main"})

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        files, sha, origin = GitHubClient(settings, client, lambda _: None).acquire(
            "https://github.com/test/repo.git"
        )
    assert sha == SHA and origin == "https://github.com/test/repo"
    assert len(files.files) == 2 and len(calls) == 3
    assert files.files[0].path == "A.java"


@pytest.mark.parametrize(
    "status,headers,code",
    [
        (302, {"location": "http://127.0.0.1/private"}, "unsafe_redirect"),
        (429, {}, "github_rate_limit"),
        (403, {"x-ratelimit-remaining": "0"}, "github_rate_limit"),
        (404, {}, "github_response"),
        (200, {"content-length": "9999999"}, "download_limit"),
        (200, {"content-encoding": "gzip"}, "github_encoding"),
    ],
)
def test_bad_responses(settings, status, headers, code):
    with httpx.Client(
        transport=httpx.MockTransport(lambda _: httpx.Response(status, headers=headers))
    ) as client:
        with pytest.raises(PipelineError) as exc:
            GitHubClient(settings, client, lambda _: None).acquire("https://github.com/a/b")
        assert exc.value.code == code


@pytest.mark.parametrize(
    "exception,code",
    [(httpx.ConnectError("offline"), "github_network"), (httpx.ReadTimeout("timeout"), "github_timeout")],
)
def test_network_errors(settings, exception, code):
    def respond(_):
        raise exception

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        with pytest.raises(PipelineError) as exc:
            GitHubClient(settings, client, lambda _: None).acquire("https://github.com/a/b")
        assert exc.value.code == code


def test_actual_stream_limit(settings):
    settings = settings.model_copy(update={"max_download_bytes": 5})

    def respond(req):
        if req.url.host == "codeload.github.com":
            return httpx.Response(200, content=b"x" * 10)
        return httpx.Response(
            200,
            json={"sha": SHA}
            if "/commits/" in req.url.path
            else {"private": False, "default_branch": "main"},
        )

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        with pytest.raises(PipelineError, match="download limit"):
            GitHubClient(settings, client, lambda _: None).acquire("https://github.com/a/b")


def test_private_and_bad_metadata(settings):
    for data, code in [({"private": True}, "private_repository"), ({"private": False}, "github_metadata")]:
        with httpx.Client(
            transport=httpx.MockTransport(lambda _, data=data: httpx.Response(200, json=data))
        ) as client:
            with pytest.raises(PipelineError) as exc:
                GitHubClient(settings, client, lambda _: None).acquire("https://github.com/a/b")
            assert exc.value.code == code


def test_dns_rejects_nonpublic_and_errors(monkeypatch):
    for address in ["127.0.0.1", "10.0.0.1", "169.254.169.254", "::1"]:
        monkeypatch.setattr(
            socket,
            "getaddrinfo",
            lambda *a, address=address, **k: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, 443))],
        )
        with pytest.raises(PipelineError) as exc:
            public_dns("api.github.com")
        assert exc.value.code == "unsafe_destination"

    def fail(*args, **kwargs):
        raise socket.gaierror("offline")

    monkeypatch.setattr(socket, "getaddrinfo", fail)
    with pytest.raises(PipelineError) as exc:
        public_dns("api.github.com")
    assert exc.value.code == "github_network"


def test_transport_pins_ip_and_tls_hostname(monkeypatch):
    import backend.codeatlas.github as github

    monkeypatch.setattr(github, "public_dns", lambda _: "140.82.112.5")
    requests = []
    transport = PinnedGitHubTransport()
    transport.transport.close()
    transport.transport = httpx.MockTransport(lambda request: requests.append(request) or httpx.Response(200))
    with httpx.Client(transport=transport) as client:
        client.get("https://api.github.com/repos/a/b")
    assert requests[0].url.host == "140.82.112.5"
    assert requests[0].headers["host"] == "api.github.com"
    assert requests[0].extensions["sni_hostname"] == "api.github.com"
