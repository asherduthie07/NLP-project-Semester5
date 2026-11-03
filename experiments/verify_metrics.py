"""Metric arithmetic checks inside the optional NLP dependency environment."""

from nlp.metrics import rouge_l, summarization_metrics


def main():
    exact = summarization_metrics(["Return the number of items."], ["Return the number of items."])
    assert abs(exact["bleu"] - 100) < 1e-8 and exact["rouge_l"] == 1
    assert rouge_l("a b", "a c") == 0.5
    assert rouge_l("", "") is None
    assert summarization_metrics([""], [""])["rouge_l"] is None
    try:
        summarization_metrics(["a"], [])
    except ValueError:
        pass
    else:
        raise AssertionError("Mismatched population accepted")
    print("5 metric checks passed; this is evaluator correctness, not model quality.")


if __name__ == "__main__":
    main()
