# Inside the Decoder

An animated, interactive single-page website with five tabs.

**Deep learning basics** (for newcomers): a neural network as a machine full of tunable dials, one neuron you can tune by hand, a 13-dial network that learns live in the browser to tell whether a fruit is good to eat (training phase, with a step-by-step explanation of one gradient step), then the same network answering new fruits with its dials frozen (inference phase), how this scales up to GPT, and a closing section on network architectures (MLP, CNN, RNN, transformer, diffusion, GNN) showing that the architecture is a research design choice matched to the data. Open it directly with `index.html#basics`.

**Key concepts** (between the basics and the transformer): three short interactive primers. *Dot product* (a match score between two lists, with a ticket-routing example and an angle view), *softmax* (scores to shares of 100%, with temperature, a mask toggle and the "add the same number" property) and *non-linearity* (why stacked straight steps collapse into one, and how bends let a line follow a curve). The decoder's attention, MLP and softmax sections link back to them. Open with `index.html#concepts`.

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
