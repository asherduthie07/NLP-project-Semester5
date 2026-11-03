def rouge_l(prediction, reference):
    # Case-sensitive whitespace tokens; length-normalized LCS F1.
    p, r = prediction.split(), reference.split()
    previous = [0] * (len(r) + 1)
    for token in p:
        row = [0]
        for index, other in enumerate(r):
            row.append(previous[index] + 1 if token == other else max(previous[index + 1], row[-1]))
        previous = row
    return 2 * previous[-1] / (len(p) + len(r)) if p or r else None


def summarization_metrics(predictions, references):
    from sacrebleu.metrics import BLEU

    if len(predictions) != len(references) or not predictions:
        raise ValueError("Aligned nonempty predictions and references required")
    bleu = BLEU(tokenize="13a", effective_order=True)
    score = bleu.corpus_score(predictions, [references])
    rouge = [rouge_l(p, r) for p, r in zip(predictions, references, strict=True)]
    defined = [v for v in rouge if v is not None]
    return {
        "bleu": score.score,
        "bleu_signature": str(bleu.get_signature()),
        "rouge_l": sum(defined) / len(defined) if defined else None,
        "reference_quality": "synthetic_unreviewed",
    }
