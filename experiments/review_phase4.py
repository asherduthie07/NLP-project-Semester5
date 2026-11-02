import argparse
import json
from pathlib import Path

from nlp.review import package, score_ner_run


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["prepare", "score-ner"])
    parser.add_argument("--dataset", type=Path, default=Path("datasets/phase4/examples.json"))
    parser.add_argument("--review", type=Path, default=Path("datasets/phase4/review"))
    parser.add_argument("--run", type=Path)
    parser.add_argument("--output", type=Path, default=Path("storage/phase4-reviewed-metrics.json"))
    args = parser.parse_args()
    if args.command == "prepare":
        package(args.dataset, args.review)
    else:
        result = score_ner_run(
            args.dataset, args.review, json.loads(args.run.read_text()) if args.run else {}
        )
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
