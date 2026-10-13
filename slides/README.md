# The Transformer Decoder, Explained (slides)

`transformer-decoder-explained.pptx` is a 20-slide, beginner-friendly PowerPoint deck. It opens with four warm-up slides (training vs. inference, non-linearity, the dot product, softmax), then follows one sentence, “The cat sat on the mat”, through a GPT-style decoder: tokens → embeddings → masked attention → Q/K/V → multi-head → feed-forward → the MLP up close (worked example) → stacked blocks → logits and softmax → decoding strategies → the generation loop → training vs. inference.

- Every diagram is built from native, editable shapes.
- Native PowerPoint click animations (fade, wipe, float-in, zoom) reveal each diagram step by step, and slides use a fade transition. Speaker notes on every slide include `[CLICK]` cues.
- Font: **Inter** (Google Fonts). Install it from https://fonts.google.com/specimen/Inter before presenting, or PowerPoint will substitute another font.

## Rebuild

```bash
cd slides
npm install
npm run build
```
