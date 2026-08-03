# Vedāntic Vyākaraṇa Academy

A free, local-first quiz app for practicing Sanskrit grammar (**vyākaraṇa**) as it actually
appears in the prasthānatrayī (Bhagavad Gītā, Upaniṣads, Brahma-sūtra) and their Śaṅkara-bhāṣya —
every question is a real junction pulled from the corpus, tagged with its Pāṇinian sūtra.

**Live app:** https://constrainedrandomvar.github.io/vedantic-vyakarana-academy/

## What's in v1

- **Sandhi** — 18 skill nodes (guṇa, vṛddhi, yaṇ, visarga-sandhi, etc.), each capped at 160 curated
  questions.
- **No-sandhi word boundaries** — a 19th node: given two real, adjacent words with NO sandhi
  between them (e.g. सुविरूढमूलम् + असङ्गशस्त्रेण, run together as
  सुविरूढमूलमसङ्गशस्त्रेण), find where one word ends and the next begins — the hardest
  segmentation case, since there's no phonological cue at all.
- **Samāsa classification** — given a word, identify its compound type (or recognize it isn't a
  compound at all — N/A). 15 fine-grained categories (dvandva, bahuvrīhi, karmadhāraya, dvigu,
  avyayībhāva, and tatpuruṣa broken out by exact vibhakti relation), ~5,000 questions.
- All three share one dashboard, one per-node mastery model ("10 correct in a row"), 10-question
  practice batches, adaptive/mixed practice modes, and offline PWA support.
- **Read a verse** — pick a text/chapter/verse (Bhagavad Gītā chapter 4 so far) and walk through it
  word-by-word, mūla first then that verse's own bhāṣya, answering whichever grammar question
  applies to each word in reading order: sandhi, samāsa, case-ending (prātipadika stem/case-number/
  gender-or-sarvanāma), verb-ending/tense (dhātu), kṛt-pratyaya (kṛdanta), or word-meaning as a
  fallback. Jump to any specific verse, resume exactly where you left off, and an optional "go
  deep" mode asks every applicable question per word instead of just one.
- More modules (taddhita, kāraka) are planned as additions to the same app — same dashboard, same
  progress tracking, not separate apps.

## How it works

- No backend, no accounts. Progress is stored in your browser's `localStorage` — it's private to
  your device/browser.
- Open `index.html` directly, or visit the live link above. Installing it as a PWA (via your
  browser's "install app" option) enables full offline use.

## Data source & license

Question content is generated from the prasthānatrayī Zenodo deposit (Tamal Maharaj,
[arXiv:2607.07282](https://arxiv.org/abs/2607.07282)), licensed **CC BY 4.0**. Sandhi/samāsa
classification and quiz curation are original work built on top of that dataset.

## Source

This repo holds the built, deployable app only. The content-generation pipeline (corpus parsing,
sandhi classification, item curation) lives in a private repo and isn't published here.
