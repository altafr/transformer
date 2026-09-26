# Inside the Decoder

An animated, interactive single-page website with three tabs.

**Deep learning basics** (for newcomers): a neural network as a machine full of tunable dials, one neuron you can tune by hand, a 13-dial network that learns live in the browser to tell whether a fruit is good to eat (training phase, with a step-by-step explanation of one gradient step), then the same network answering new fruits with its dials frozen (inference phase), how this scales up to GPT, and a closing section on network architectures (MLP, CNN, RNN, transformer, diffusion, GNN) showing that the architecture is a research design choice matched to the data. Open it directly with `index.html#basics`.

**Transformer overview** (high level): the 2017 Google paper *Attention Is All You Need* (https://arxiv.org/abs/1706.03762), a clickable encoder–decoder diagram, an animated English→French translation showing cross-attention, and the three model families (encoder-only, encoder–decoder, decoder-only) leading into the decoder tab. Open with `index.html#overview`.

**Transformer decoder**: walks through how a decoder-only transformer (GPT-style) predicts the next word:

0. Training: where the embeddings and weight matrices come from (a real tiny model trains live in the browser)
1. Tokenization
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
