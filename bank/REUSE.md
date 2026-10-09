# How the show reuses questions (University Duel 2025 and 2026)

Worked out on 9 Oct 2026. Sources: the reviewed 2026 knockout matches; unreviewed OCR of QF4, QF2's last two
Brain Match quarters and 2026 group-stage matchdays 1, 6 and 12 (six matches); and the auto transcripts of 36 of
the 38 match videos of both seasons. Tools: `pipeline/repeats.py` (question against question) and
`pipeline/tx_match.py` (known question against a video's transcript).

## Summary

- Within a season, the show recycles questions, mostly Quick Buzz Applied Maths, and in the same order as
  before: it works through running lists of questions, and later matches pick up the same list.
- Repeats stay within a phase. Group stage questions seldom reach the knockouts, and each knockout round
  (quarter-finals, semi-finals, third place with the final) has its own questions.
- 2025 and 2026 do not share questions beyond a stray one or two. What carries over is the question types and
  templates, often with new numbers.

## 2026 knockouts (exact)

| Round | Questions asked | Different questions | Asked again within the round |
|---|---|---|---|
| Quarter-finals (4 matches) | 597 | 515 | 82 (14%) |
| Semi-finals (2) | 363 | 321 | 42 (12%) |
| Third place and final | 425 | 384 | 41 (10%) |

- Repeats come in pairs of matches, almost all in Quick Buzz Applied Maths, in the same order:
  QF1 and QF3 share 37 (35 maths), QF2 and QF4 share 27 (all maths), SF1 and SF2 share 42 (36 Quick Buzz,
  6 Brain Match maths), third place and final share 41 (20 maths and 15 verbal reasoning in Quick Buzz, plus
  one Brain Match question per subject).
- The quarter-final Quick Buzz maths is one ordered list used in a loop: QF4 started near the end of QF1's run,
  went through all of QF2's run in order, then continued with QF1's opening questions. QF3 started where QF1 did.
- Quick Buzz GK, VR and DA, and almost all Brain Match questions, were new in every match.
- Across rounds each match shares only 1 to 3 questions with other rounds. About 40 templates come back across
  rounds with new numbers (simple interest rate, "every value in a dataset is 7", covariance from SDs and r,
  gold/silver/bronze arrangements).

## 2026 group stage (exact for matchdays 1, 6 and 12)

| Match | Questions | Also asked in another of these six matches |
|---|---|---|
| MD1 UNILAG v FUTA | 115 | 60 (52%): 25 in MD6 OAU v KASU, 31 in MD6 CALEB v YABATECH, 23 in MD12 FUTA v UNIBEN |
| MD1 CU v UNILORIN | 111 | 13 (12%) |
| MD6 OAU v KASU | 143 | 61 (43%): 29 in MD12 FUTA v UNIBEN, 14 in MD12 UNILAG v EKSU |
| MD6 CALEB v YABATECH | 113 | 41 (36%) |
| MD12 UNILAG v EKSU | 115 | 16 (14%) |
| MD12 FUTA v UNIBEN | 132 | 39 (30%) |

- 729 questions asked in the six matches, 607 different, 122 repeats (17%). Of the repeated questions, 75 are
  Quick Buzz (mostly maths), 23 Brain Match (nearly all Applied Maths), 3 both. Every repeat came back in its original order.
- FUTA's matchday 12 match reused 23 Quick Buzz questions from FUTA's own matchday 1 match.
- Only 8 of the 607 also appear in the knockouts.
- Transcripts of all twelve 2026 matchday videos show the same pattern across the whole group stage: each
  matchday shares stretches of read-out question text with one to three others, most often six matchdays apart
  (1 and 7, 2 and 8, 3 and 9, 4 and 10, 5 and 11, 6 and 12), plus 1 and 6, 6 and 12, and 3 and 10.

## 2025 against 2026 (from transcripts)

A transcript catches roughly 25 to 45% of a match's questions (calibrated on matches whose questions are known),
and false matches are about 1 in 500 question checks.

- 16 transcripts from 2025 checked against about 1,800 known 2026 questions (knockouts plus matchdays 1 and 6):
  0 to 2 hits per video, which is the false-match level. The one clear exact repeat is "Chen earns $300 per month
  ... 15% pay rise" (2025 matchday 4, 2026 final Brain Match).
- Shared transcript passages between the seasons are host lines, not questions.
- The 2025 group stage shows the same within-season reuse as 2026 (median 3, up to 21 shared question passages
  between its matchday videos).
