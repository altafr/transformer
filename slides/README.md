# The Transformer Decoder, Explained (slides)

`transformer-decoder-explained.pptx` is a 27-slide, beginner-friendly PowerPoint deck. It opens with five warm-up slides (weights as dials that learn, training vs. inference, non-linearity, the dot product, softmax), then follows one sentence, “The cat sat on the mat”, through a GPT-style decoder: tokens → embeddings → masked attention → Q/K/V → multi-head → feed-forward → the MLP up close (worked example) → stacked blocks → logits and softmax → decoding strategies → the generation loop → training vs. inference.

- Practical slides (from the “How LLMs Actually Work” and “How Attention Works” videos) cover tokens and cost, why attention was invented (the 2014 bottleneck), how context flips what “it” means, the context window and statelessness, why long chats get slow and confused, and what the mechanism explains in practice (including hallucination).
- Every diagram is built from native, editable shapes.
- Native PowerPoint click animations (fade, wipe, float-in, zoom) reveal each diagram step by step, and slides use a fade transition. Speaker notes on every slide include `[CLICK]` cues.
- Font: **Inter** (Google Fonts). Install it from https://fonts.google.com/specimen/Inter before presenting, or PowerPoint will substitute another font.

`decoder-essentials.pptx` is a separate two-slide deck: the whole decoder on one slide (tokenize → embed + position → masked attention → feed-forward → output layer → pick and repeat), and a classic neural network that trains (forward pass, error, backward pass) and then answers with frozen weights. Both slides use click animations and have speaker notes.

## Rebuild

```bash
cd slides
npm install
npm run build              # transformer-decoder-explained.pptx
npm run build:essentials   # decoder-essentials.pptx
```
