# Inside the Decoder

An animated, interactive single-page website with seven tabs.

**Deep learning basics** (for newcomers): a neural network as a machine full of tunable dials, one neuron you can tune by hand, a 13-dial network that learns live in the browser to tell whether a fruit is good to eat (training phase, with a step-by-step explanation of one gradient step), then the same network answering new fruits with its dials frozen (inference phase), how this scales up to GPT, and a closing section on network architectures (MLP, CNN, RNN, transformer, diffusion, GNN) showing that the architecture is a research design choice matched to the data. Open it directly with `index.html#basics`.

**Deep learning basics** now opens with a four-round machine-learning warm-up (*What is a model?*): spot a number pattern, predict café busyness from a six-row table (so the audience builds a model in their head), then watch a real logistic-regression model learn an eight-column loan rule live in the browser, and finally see it fail when 8×8 T/L pictures are shifted, which motivates deep learning. Open with `index.html#basics`.

**Key concepts** (between the basics and the transformer): three short interactive primers. *Dot product* (a match score between two lists, with a ticket-routing example and an angle view), *softmax* (scores to shares of 100%, with temperature, a mask toggle and the "add the same number" property) and *non-linearity* (why stacked straight steps collapse into one, and how bends let a line follow a curve). The decoder's attention, MLP and softmax sections link back to them. Open with `index.html#concepts`.

**Math Primer** (`preread-math.html`): the same handout idea with no reference to any particular application. Eleven everyday maths ideas (vector, multidimensional space, closeness, dot product, matrix multiplication, softmax, weighted choice, bends, rescaling, error and nudging, feedback loops), each with a worked example you can check by hand and an automation comparison.

**Decoder Primer** (`preread-primer.html`): the short version for the audience. A 10-minute, script-free handout with one sentence to remember, a route from prompt to next token, eight plain-language ideas (token, vector, embedding, dot product, matrix and weights, softmax, training versus using, the next-token loop) each with an automation comparison and where it comes up, three questions to bring, and a short glossary.

**Decoder Foundations** (`preread-foundations.html`): a second standalone pre-read, written for an automation audience. Fourteen short topics (vector, n-dimensional vector space, dot product, matrix multiplication, softmax, tokens, embeddings, reading shapes, weights and training, non-linearity, residual and normalisation, sampling, attention in one paragraph, autoregression and the context window), each with an automation analogy, a note on where the decoder uses it and a small widget. Includes a topic index with core and helpful tags, a read-progress tracker, a topic-to-session map, a self-check and a glossary.

**Pre-read** (`preread.html`): a separate, standalone reading page for the audience to read before the decoder session. Seven short parts cover what a model is, why deep learning, a neuron as dials, training versus inference, dot product, softmax and non-linearity (each with a small hands-on widget), architectures and scale, and a map from these ideas to the decoder steps, plus a glossary and a self-check. About 18 minutes.

**Python code pop-up** (Transformer decoder tab): every decoder step has a *Python code ↗* link that opens a small window (or an in-page panel where pop-ups are blocked). It shows a tiny GPT-2-style decoder in PyTorch that grows step by step: tokenizer, embeddings, positions, Q/K/V, masked attention, multi-head attention, Add & Norm, MLP, stacked blocks, final softmax, sampling and the generation loop, with training shown at step 0. Earlier chunks are dimmed, the current step is highlighted, the window follows the section on the page, and your own input sentence is used as the prompt. The full runnable file is in `examples/mini_gpt.py` (`pip install torch && python examples/mini_gpt.py`; tested on CPU with PyTorch, trains in about 30 seconds), and the window can copy or download it.

**Animated explainers**: three short Three.js films in a soft clay studio style, each with a timeline scrubber, chapter jumps and keyboard controls (Space plays and pauses, arrows step one frame). *Deep learning basics* (50 s) is the basics tab as a film: a T-versus-L pixel model that breaks when the letter shifts, the 13-dial fruit network, one neuron (multiply, add, squash), training on the 60 fruits (a real run: the network trains in the browser when the film loads, and the dials, opinion map, error count and loss curve come from it), inference with frozen dials, the jump to 175 billion dials, and four architectures. *How a neural network learns* shows a tiny cat/dog/bird network whose wires carry dials (weights): a dot product computed input by input, ReLU bending values on a 3D graph, softmax turning scores into probabilities, and training turning every dial while the loss curve falls. *How a decoder transformer predicts the next token* follows “The cat sat on the” through embeddings, causal attention, the MLP, the vocabulary projection, sampling and the generation loop with a KV cache. Every frame is a function of one time value, so playback is deterministic. The films load only when the tab is opened and pause when you leave it. Open with `index.html#film`, or on their own at `explainer/deep-learning-basics.html`, `explainer/basics.html` and `explainer/`. Design: [Altaf Rehmani](https://altafrehmani.netlify.app/).

**Transformer overview** (high level): the 2017 Google paper *Attention Is All You Need* (https://arxiv.org/abs/1706.03762), a clickable encoder–decoder diagram, an animated English→French translation showing cross-attention, and the three model families (encoder-only, encoder–decoder, decoder-only) leading into the decoder tab. Open with `index.html#overview`.

**Bird’s-eye view** (between the overview and the decoder): one sentence, “Approve the invoice if”, followed through ten illustrative stages (text → IDs → embeddings → position → attention → many heads → MLP → stacked blocks → scoring and softmax → picking a word → the autoregressive loop), with a small pastel decoder-only stack in the left navigation (above the stage on phones and in Present mode) that lights up the part being explained (click a part to jump to its stage), then a “working smartly with these models” section of eight because-so cards tied back to the stages, and a weak-versus-strong prompt makeover. Open with `index.html#birdseye`.

**Transformer decoder**: walks through how a decoder-only transformer (GPT-style) predicts the next word:

0. Training: where the embeddings and weight matrices come from (a real tiny model trains live in the browser)
1. Tokenization
1b. Embeddings up close: a word2vec-style model trains live so similar words cluster (training), then the frozen table is used as a lookup with nearest neighbours (inference), plus illustrative panels on analogy directions and context
2. Positional encoding
3a. Where Q, K and V come from (x · W_Q, x · W_K, x · W_V, computed live)
3b. Masked multi-head attention
4. Add & Norm
5. Multiple heads
6. MLP (feed-forward)
7. Final linear + softmax
8. Next-word prediction
9. The generation loop

Type any text in the input box and every step recomputes. Press **Present** for a one-step-per-screen slideshow (← / → to move, **P** to replay a step's animation, **Esc** to exit). Each step has presenter notes.

Open `index.html` in a browser. There is no build step.

Everything uses exactly the text you type.

- **Steps 1–6** run a real, tiny decoder block on your text in the browser (16-dim vectors, 4 heads, 64-neuron MLP) with fixed random weights, so every intermediate number is visible.
- **Steps 7–9** call a real language model with your exact text for every next token:
  - On the web (Netlify, GitHub Pages, or a local file with internet), the page downloads **GPT-2 (distilgpt2, ~80 MB, cached after the first visit)** via transformers.js and runs it in the browser. Step 1 then shows GPT-2's real tokens and IDs, and step 7 shows its true logits and probabilities.
  - Inside a Claude artifact, where downloads are blocked, it asks **Claude** for the next token and its estimated probabilities.
  - If neither is reachable it falls back to a tiny offline word table, and the badge at the top says so.

## Deploy to Netlify

No build step. Either:

1. **Connect the repo:** Netlify → *Add new site* → *Import an existing project* → GitHub → `altafr/transformer`, choose this branch (or `main` once merged). Build command empty, publish directory `.` (already set in `netlify.toml`).
2. **Drag and drop:** open https://app.netlify.com/drop and drop `index.html`.


**Demos**: embeds the [Transformer Explainer](https://poloclub.github.io/transformer-explainer/) from Georgia Tech's Polo Club (a live GPT-2 small in the browser) in an iframe, loaded on demand. Open with `index.html#demos`. Inside a Claude artifact, embedding other sites is blocked, so the tab shows an "Open in a new tab" link instead.

**Animated recaps**: decoder steps 1, 2, 3a, 3b, 5, 6, 7 and 9 embed the matching Manim animations from Praveen Sampath's [The Animated Transformer](https://prvnsmpth.github.io/animated-transformer/) ([source](https://github.com/prvnsmpth/animated-transformer)). They are streamed from the author's GitHub repo via jsDelivr, pinned to commit `7cf627d`, and are not copied into this repository. Inside a Claude artifact, where other hosts' media is blocked, each clip is replaced by a link to the article.

**Presenter scripts**: every section (24 across all four tabs) has a small "Presenter script" link in its header. It opens a short, plain-English spoken script (about 40 to 60 seconds each, roughly 19 minutes in total) in a small pop-up window with Previous / Next and a Copy button, plus a one-line cue for what to click. The script window stays in sync with the page: it switches automatically when the presented section changes (scrolling, Present-mode arrow keys, the side menu or the tab bar), and its Previous / Next buttons (or the arrow keys inside it) move the page to that section too. If pop-ups are blocked (for example inside a Claude artifact), the same script appears in a small in-page window instead. The scripts live in the `SCRIPTS` object in `index.html`.

**Structured presenter notes** (decoder tab): every decoder section's Presenter notes now carry your talk track from the presentation script (running example "Approve the invoice if"), the analogy and where it breaks, the transition, likely questions and slip-ups to avoid. Items added during review are tagged "added" and corrections "fixed". The opening section also has a table mapping your script's steps to the page's sections.

## Single-file build

`tools/build-single.mjs` bundles the site and the three Three.js films into one self-contained HTML file (about 2.2 MB, works offline apart from web fonts):

```
mkdir build && cd build && npm init -y && npm i three@0.169.0 esbuild
node ../tools/build-single.mjs .. ../inside-the-decoder.html
```
