# Inside the Decoder

An animated, interactive single-page website that walks through how a decoder-only transformer (GPT-style) predicts the next word:

1. Tokenization
2. Positional encoding
3. Masked multi-head attention
4. Add & Norm
5. Multiple heads
6. MLP (feed-forward)
7. Final linear + softmax
8. Next-word prediction
9. The generation loop

Type any text in the input box and every step recomputes. Press **Present** for a one-step-per-screen slideshow (← / → to move, **P** to replay a step's animation, **Esc** to exit). Each step has presenter notes.

Open `index.html` in a browser. There is no build step.

Steps 1–6 run a real, tiny decoder block in the browser (16-dim vectors, 4 heads, 64-neuron MLP) with fixed random weights. The next-word probabilities come from a small hand-built table, because an untrained model would not produce sensible words.
