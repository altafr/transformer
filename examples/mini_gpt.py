"""mini_gpt.py: a tiny GPT-2-style decoder-only transformer in PyTorch.

Run:  pip install torch  &&  python mini_gpt.py
It trains in a few seconds on a CPU, then continues a prompt one token at a time.
The chunks below follow the steps of the "Transformer decoder" tab, in order.
"""

#@@ s0 | Training: where the weights come from | Training is a loop: guess the next token at every position, measure the error, nudge every weight. The model class comes later; this only needs a model that maps token IDs to logits.
import re
import math
import torch
import torch.nn as nn
import torch.nn.functional as F


def train(model, ids, steps=400, batch=16, lr=3e-3):
    """ids: 1-D tensor holding the whole training text as token IDs."""
    T = model.cfg.block_size
    opt = torch.optim.AdamW(model.parameters(), lr=lr)
    for step in range(steps):
        # random windows of text; the target is the same window shifted one token left
        starts = torch.randint(0, len(ids) - T - 1, (batch,))
        x = torch.stack([ids[s : s + T] for s in starts])          # (B, T)  inputs
        y = torch.stack([ids[s + 1 : s + T + 1] for s in starts])  # (B, T)  next tokens
        logits = model(x)                                          # (B, T, vocab)
        loss = F.cross_entropy(logits.view(-1, logits.size(-1)), y.view(-1))
        opt.zero_grad()
        loss.backward()   # how much did each weight contribute to the error?
        opt.step()        # nudge every weight a little to lower it
        if step % 100 == 0:
            print(f"step {step:4d}  loss {loss.item():.3f}")

#@@ s1 | Tokenisation | Text becomes integer IDs, because the model can only do arithmetic. This toy splits on words and punctuation; GPT-2 uses byte-pair encoding with about 50,000 sub-word tokens.
class Tokenizer:
    def __init__(self, corpus):
        pieces = sorted(set(self.split(corpus)))
        self.itos = ["<unk>"] + pieces                      # ID -> token
        self.stoi = {t: i for i, t in enumerate(self.itos)} # token -> ID

    @staticmethod
    def split(text):
        return re.findall(r"\w+|[^\w\s]", text.lower())

    def encode(self, text):
        return [self.stoi.get(t, 0) for t in self.split(text)]

    def decode(self, ids):
        return " ".join(self.itos[i] for i in ids)


class Config:
    vocab_size = None   # filled in from the tokenizer
    block_size = 32     # longest context the model can read
    n_embd = 64         # numbers per token (GPT-2 small: 768)
    n_head = 4          # attention heads per block (GPT-2 small: 12)
    n_layer = 2         # decoder blocks stacked (GPT-2 small: 12)

#@@ se | Embeddings | Each token ID selects one row of a learned table. The row is that token's vector. Nothing about the token's meaning is hand-written; training shapes the table.
class TokenEmbedding(nn.Module):
    def __init__(self, cfg):
        super().__init__()
        self.table = nn.Embedding(cfg.vocab_size, cfg.n_embd)  # one row per vocabulary entry

    def forward(self, idx):          # idx: (B, T) integer IDs
        return self.table(idx)       # (B, T, n_embd)  a lookup, not a calculation

#@@ s2 | Positional encoding | Attention ignores word order by itself, so each position gets its own learned vector, added to the token vector. (The 2017 paper used fixed sine and cosine waves; GPT-2 learns them.)
class PositionEmbedding(nn.Module):
    def __init__(self, cfg):
        super().__init__()
        self.table = nn.Embedding(cfg.block_size, cfg.n_embd)  # one row per position

    def forward(self, T):
        return self.table(torch.arange(T))   # (T, n_embd)

# input to the first block:  x = TokenEmbedding(idx) + PositionEmbedding(T)

#@@ s3a | Q, K, V | Three learned matrices turn every token's vector into a query, a key and a value. The same matrices are used for every token; only the input x changes. Here they are packed into one Linear layer.
class QKV(nn.Module):
    def __init__(self, cfg):
        super().__init__()
        self.proj = nn.Linear(cfg.n_embd, 3 * cfg.n_embd)  # W_Q, W_K, W_V side by side

    def forward(self, x):                                   # x: (B, T, n_embd)
        q, k, v = self.proj(x).chunk(3, dim=-1)             # each (B, T, n_embd)
        return q, k, v                                      # query: what I look for; key: what I offer; value: what I hand over

#@@ s3 | Masked attention | Each token scores every earlier token (query · key), the future is masked out, softmax turns the scores into weights, and the output is a weighted blend of the values.
def masked_attention(q, k, v):
    d = q.size(-1)
    T = q.size(-2)
    scores = q @ k.transpose(-2, -1) / math.sqrt(d)               # (.., T, T) match score for every pair
    causal = torch.tril(torch.ones(T, T, dtype=torch.bool))       # lower triangle = allowed to look at
    scores = scores.masked_fill(~causal, float("-inf"))           # hide the future
    weights = F.softmax(scores, dim=-1)                           # each row sums to 1
    return weights @ v                                            # weighted mix of earlier tokens' values

#@@ s4 | Add & Norm | Add the layer's output back to its input (the residual path), and normalise so the numbers stay well-scaled. GPT-2 normalises before the layer (pre-norm); the 2017 paper did it after.
class AddNorm(nn.Module):
    def __init__(self, cfg, layer):
        super().__init__()
        self.norm = nn.LayerNorm(cfg.n_embd)
        self.layer = layer

    def forward(self, x):
        return x + self.layer(self.norm(x))   # x + layer(norm(x))

#@@ s5 | Multiple heads | Run attention several times side by side, each head on its own slice of the numbers, so each can look for a different kind of relationship. Join the results and mix them with one more matrix, W_O.
class MultiHeadAttention(nn.Module):
    def __init__(self, cfg):
        super().__init__()
        self.h = cfg.n_head
        self.qkv = QKV(cfg)
        self.out = nn.Linear(cfg.n_embd, cfg.n_embd)          # W_O

    def forward(self, x):
        B, T, C = x.shape
        q, k, v = self.qkv(x)
        split = lambda t: t.view(B, T, self.h, C // self.h).transpose(1, 2)  # (B, heads, T, C/heads)
        y = masked_attention(split(q), split(k), split(v))    # every head at once
        y = y.transpose(1, 2).reshape(B, T, C)                # concatenate the heads
        return self.out(y)                                    # mix them with W_O

#@@ s6 | MLP | After attention has gathered context, each token passes alone through a small two-layer network: widen 4x, apply a non-linearity (GELU), narrow back. Then the block is complete.
class MLP(nn.Module):
    def __init__(self, cfg):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(cfg.n_embd, 4 * cfg.n_embd),
            nn.GELU(),                                        # the non-linearity
            nn.Linear(4 * cfg.n_embd, cfg.n_embd),
        )

    def forward(self, x):
        return self.net(x)


class Block(nn.Module):
    """One decoder block: attention then MLP, each wrapped in Add & Norm."""
    def __init__(self, cfg):
        super().__init__()
        self.attn = AddNorm(cfg, MultiHeadAttention(cfg))
        self.mlp = AddNorm(cfg, MLP(cfg))

    def forward(self, x):
        return self.mlp(self.attn(x))

#@@ s7 | Final softmax | Stack the blocks, normalise once more, then score every vocabulary token against the last vector (the unembedding). Softmax turns the scores into probabilities.
class GPT(nn.Module):
    def __init__(self, cfg):
        super().__init__()
        self.cfg = cfg
        self.tok = TokenEmbedding(cfg)
        self.pos = PositionEmbedding(cfg)
        self.blocks = nn.Sequential(*[Block(cfg) for _ in range(cfg.n_layer)])
        self.norm = nn.LayerNorm(cfg.n_embd)
        self.head = nn.Linear(cfg.n_embd, cfg.vocab_size, bias=False)   # the unembedding
        self.head.weight = self.tok.table.weight   # GPT-2 reuses the embedding table here

    def forward(self, idx):                                   # idx: (B, T)
        x = self.tok(idx) + self.pos(idx.size(1))             # steps 2 and 3: embeddings + positions
        x = self.blocks(x)                                    # the stack of blocks
        return self.head(self.norm(x))                        # (B, T, vocab) raw scores, called logits


def next_token_probs(model, idx):
    logits = model(idx)[:, -1, :]    # only the LAST token's vector predicts the next token
    return F.softmax(logits, dim=-1) # (B, vocab) probabilities that add up to 1

#@@ s8 | Next word | Choose one token from the probabilities. Greedy always takes the top one. Sampling rolls weighted dice; temperature sharpens or flattens the odds, and top-k drops the long tail.
def pick(logits, temperature=1.0, top_k=None, greedy=False):
    if greedy:
        return logits.argmax(dim=-1, keepdim=True)
    logits = logits / temperature                              # <1 sharper, >1 flatter
    if top_k:
        cutoff = torch.topk(logits, top_k).values[..., -1:]
        logits = logits.masked_fill(logits < cutoff, float("-inf"))
    probs = F.softmax(logits, dim=-1)
    return torch.multinomial(probs, num_samples=1)             # weighted dice

#@@ s9 | Generation loop | Append the chosen token to the text and run the whole model again. Repeat until enough tokens are written. This loop is why models answer one token at a time.
@torch.no_grad()
def generate(model, idx, n_new=12, **pick_args):
    for _ in range(n_new):
        window = idx[:, -model.cfg.block_size:]               # keep within the context length
        logits = model(window)[:, -1, :]                      # last position only
        nxt = pick(logits, **pick_args)
        idx = torch.cat([idx, nxt], dim=1)                    # append and go round again
    return idx


if __name__ == "__main__":
    torch.manual_seed(0)
    prompt = "The cat sat on the"
    corpus = (prompt + " mat. ") * 3 + (
        "The dog sat on the rug. The cat chased the mouse. "
        "The bird sat on the wall. The cat slept on the bed. "
    ) * 3   # a tiny corpus, so the model mostly memorises it (GPT-2 saw about 40 GB of text)
    tok = Tokenizer(corpus + " " + prompt)
    cfg = Config()
    cfg.vocab_size = len(tok.itos)
    model = GPT(cfg)
    train(model, torch.tensor(tok.encode(corpus)))
    start = torch.tensor([tok.encode(prompt)])                # (1, T)
    print(tok.decode(generate(model, start, n_new=8, greedy=True)[0].tolist()))
