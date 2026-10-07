# Capture and processing pipeline

How the question bank is made from the University Duel videos.

1. **Capture** (`capture.js`), run in the YouTube watch page in a browser tab that stays visible. It plays the video at 2x, finds the question box, and saves crops of each question, every green answer bar (the show's own answer) and the end-of-quarter score cards. `__udGetTranscript()` keeps YouTube's auto transcript. `__udSave(name, videoId)` downloads everything as one .tar.
2. **Processing** (`process_capture.py` with `boxtext.py`): reads each frame with Tesseract (question lines, the three options split at the bullet dots, the answer bar, the name plate, both scores), groups frames into questions and works out each score change. Output: `bank/raw/*.json`.
3. **Review** (`review_tiles.py` makes sheets of question boxes next to the answer bars). Each question gets a subject and topic, and any OCR slip or maths notation is fixed by hand. Output: `bank/review/*.json`.
4. **Merge** (`merge_review.py` with a match config in `bank/config/`): applies the review, decides the tag and how the contestant did, and writes `bank/master/<match>.json`.
5. **Solutions** (`solution_batches.py` splits the Applied Maths and Data Analysis questions into batches): each answer is solved independently and checked in code, then a full solution and a speed trick are written. Output: `bank/solutions/*.json`.
6. **Build**: `npm run bank`.

Notes from checking: the green bar always shows the show's answer, including when the player was wrong or nobody answered, so a question with a captured bar has its answer confirmed by the show. The score updates when the answer window closes.
