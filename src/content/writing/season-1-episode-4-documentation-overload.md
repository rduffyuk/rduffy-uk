---
author: Ryan Duffy
featured: false
categories:
- Season 1
- Knowledge Management
- Automation
pubDatetime: 2025-10-05 12:00:00+00:00
draft: false
episode: 4
reading_time: 9 minutes
series: 'Season 1: From Zero to Automated Infrastructure'
description: A weekend implementing ChromaDB, a Monday demoing it at work, and discovering that 1,142 files need more than folders - they need semantic search.
tags:
- obsidian
- knowledge-management
- chromadb
- automation
- documentation
- rag
- convocanvas
- semantic-search
- prefect
- work-life-balance
title: 'ChromaDB Weekend: From 504 to 24,916 Documents'
word_count: 2100
---
# Episode 4: ChromaDB Weekend - From 504 to 24,916 Documents

**Series**: Season 1 - From Zero to Automated Infrastructure
**Episode**: 4 of 8
**Dates**: September 20-27, 2025
**Reading Time**: 9 minutes

---

## September 20: The Search Problem

*Vault Evidence: `TODO-Resume-MCP-ChromaDB-Integration-2025-09-20.md` - ChromaDB integration planning started this day.*

After installing Ollama and 17 local models the previous weekend, I had a new problem: I couldn't find anything.

```bash
find obsidian-vault -name "*.md" | wc -l
```

**Output**: `1142`

**One thousand, one hundred and forty-two markdown files** in 11 days.

The vault structure was beautiful. The tags were comprehensive. But finding anything was impossible.

**The Traditional Search Problem:**
```bash
# Looking for the Day Zero planning session
grep -r "ConvoCanvas MVP" .
# Result: 312 matches across 89 files

# Looking for ChromaDB research
find . -name "*chroma*"
# Result: 47 files. Which one has what I need?
```

**Manual search was taking 25 minutes** to find what I needed. I was spending more time searching than building.

I needed semantic search. Working with Claude, we started planning ChromaDB integration.

---

## September 21-22: Weekend Implementation

### Saturday Evening: The Decision

*Vault Evidence: `ChromaDB-Baseline-Performance-Report-2025-09-22.md` created 18:45 - Shows 504 documents already indexed, 5-6ms query performance.*

Saturday evening (Sept 21), I set up ChromaDB in a virtual environment:

```bash
# Create environment
python -m venv chromadb-env
source chromadb-env/bin/activate

# Install dependencies
pip install chromadb sentence-transformers

# Verify GPU access
python -c "import torch; print(f'CUDA: {torch.cuda.is_available()}')"
# Output: CUDA: True (RTX 4080 detected)
```

**The Indexing Script** (`vault_indexer.py`):
```python
import chromadb
from sentence-transformers import SentenceTransformer
from pathlib import Path

# Initialize ChromaDB
client = chromadb.PersistentClient(path="./chromadb_data")
collection = client.get_or_create_collection("obsidian_vault")

# Load embedding model
model = SentenceTransformer('all-MiniLM-L6-v2')  # 384-dim embeddings

def index_file(file_path: Path):
    """Index a single markdown file."""
    with open(file_path, 'r') as f:
        content = f.read()

    # Skip empty files
    if len(content.strip()) < 50:
        return

    # Generate embedding
    embedding = model.encode(content)

    # Add to collection
    collection.add(
        documents=[content],
        embeddings=[embedding.tolist()],
        ids=[str(file_path)]
    )

# Index all markdown files
vault_path = Path("obsidian-vault")
for md_file in vault_path.rglob("*.md"):
    index_file(md_file)
    print(f"Indexed: {md_file}")

print(f"Total files indexed: {collection.count()}")
```

By Saturday night, I had **504 documents indexed** with **5-6ms query performance**.

### Sunday: Performance Optimization

*Vault Evidence: `ChromaDB-Rust-Backend-Success-2025-09-22.md` created 20:20 - Shows 4.7x performance improvement after Rust backend deployment.*

Sunday evening (Sept 22), working with Claude, we upgraded to the Rust HNSW backend:

```bash
pip install chroma-hnswlib
```

**Performance improvement:**
- Before: 33.59ms average query latency
- After: 7.19ms average query latency
- **4.7x faster** with the Rust backend

```
┌────────────────────────────────────────────────────────────┐
│             ChromaDB Architecture - Sept 22, 2025          │
└────────────────────────────────────────────────────────────┘

 📁 Vault Files (1,142 markdown files)
            │
            ▼
    🔄 Indexing Pipeline
            │
            ├─→ 📝 Text extraction
            ├─→ 🧩 Chunking (semantic units)
            ├─→ 🔢 Embedding generation (all-MiniLM-L6-v2)
            │
            ▼
    💾 ChromaDB Vector Database (Rust HNSW backend)
            │
            ├─→ 📊 504 documents indexed
            ├─→ 🎯 384-dimensional vectors
            ├─→ ⚡ 7.19ms average query
            │
            ▼
    🔍 Semantic Search API (Port 8002)
            │
            ├─→ 🤖 Claude (via MCP)
            ├─→ 💻 Aider (via bridge)
            └─→ 🌐 Web queries
```

---

## September 23: Work Prep

*Vault Evidence: `ChromaDB-vs-pgvector-Analysis-2025-09-23.md` and related files show comparison work for SecureLocal-LLM project.*

Monday (Sept 23) was back to the day job. But I had a Research Team demo scheduled for Tuesday (Sept 24), and I wanted to show this ChromaDB system.

During work, I also compared ChromaDB vs pgvector for a SecureLocal-LLM project. The comparison helped me understand ChromaDB's strengths better:
- Simpler setup than pgvector
- GPU-accelerated embeddings
- Better performance for single-user scenarios

By Monday evening, the system was demo-ready.

---

## September 24: The Demo Day

*Vault Evidence: `Research-Team-Demo-Claude-Code-2025-09-24.md` shows demo presentation with 598 documents indexed, sub-8ms queries.*

Tuesday (Sept 24) - Demo day at work.

**What I showed the BT Research Team:**
```yaml
System: ChromaDB + Claude Code + LibreChat
Documents Indexed: 598 (grew from 504 over the weekend)
Performance: Sub-8ms queries with Redis caching
GPU: RTX 4080 (16GB VRAM)
Models: 19 specialized AI models via LibreChat
```

**Live Demo:**
```bash
# Search: "FastAPI refactoring session"
# Result: <8ms, found correct file from Sept 15
```

The demo went well. The team was impressed that I'd built this over a weekend.

**But here's the reality:** I wasn't "presenting my personal project" - I was demoing a tool that would help with our enterprise AI work. The line between personal exploration and work preparation was blurry.

---

## September 27: The Scaling Push

*Vault Evidence: `1-High-ChromaDB-Indexing-Success-Report-2025-09-27.md` shows massive indexing improvement to 24,916 documents, 98.6% vault coverage.*

By Friday (Sept 27), I'd spent more time optimizing. Working with Claude, we achieved a massive scaling improvement:

**Before (Sept 22)**:
- Documents: 504
- Coverage: 65% of vault
- Chunks per file: ~1

**After (Sept 27)**:
- Documents: **24,916**
- Coverage: **98.6% of vault**
- Chunks per file: ~32
- Performance: Maintained <10ms queries

**The breakthrough:** Proper chunking. Instead of indexing whole files, we broke them into 750-token semantic chunks. This meant:
- 32x more precise search results
- Better context matching
- Maintained fast query speed

**4,840% improvement** in one week.

---

## The First Real Search

With 24,916 documents indexed, I could finally ask natural language questions:

**Search Interface:**
```python
def search_vault(query: str, n_results: int = 5):
    """Search vault with semantic similarity."""
    # Generate query embedding
    query_embedding = model.encode(query)

    # Search collection
    results = collection.query(
        query_embeddings=[query_embedding.tolist()],
        n_results=n_results
    )

    return results
```

**Example Query:**
```python
search_vault("How did I set up Ollama with DeepSeek?")
```

**Result** (in 0.4 seconds):
```json
{
  "results": [
    {
      "file": "2025-09-18-LLM-Inference-Servers-Comparison.md",
      "similarity": "94.2%",
      "preview": "DeepSeek R1:7b achieves 71.61 tokens/sec..."
    },
    {
      "file": "2025-09-18-reflection-journal.md",
      "similarity": "91.7%",
      "preview": "Configured Ollama with GPU optimization..."
    }
  ]
}
```

**It worked.** No more 25-minute manual searches. Semantic search found exactly what I needed in under half a second.

---

## What Worked

**Rust HNSW Backend:**
4.7x performance improvement with zero code changes. Just `pip install chroma-hnswlib`.

**Semantic Chunking:**
Breaking files into 750-token chunks instead of whole-file indexing gave 32x better precision.

**GPU Acceleration:**
RTX 4080 generated embeddings 10x faster than CPU. Weekend project became viable because of GPU speed.

**MCP Integration:**
Claude Code could now search the vault via MCP. The AI building its own memory system.

---

## What Still Sucked

**Work/Personal Boundary:**
Built this for personal use, but demoed at work. Is it a personal project or work tool? Both? Neither?

**Obsession Creep:**
Spent Friday evening (Sept 27) optimizing something that already worked. The 504→24,916 scaling was cool but... did I need it?

**No Web Interface:**
CLI-only search. Fine for me, but not shareable.

---

## The Numbers (Sept 20-27, 2025)

| Metric | Value |
|--------|-------|
| **Files in Vault** | 1,142 |
| **Documents Indexed** | 24,916 (chunked) |
| **Initial Indexing** | Sept 21-22 (weekend) |
| **Performance Optimization** | Sept 22 (Rust backend) |
| **Work Demo** | Sept 24 (BT Research Team) |
| **Scaling Work** | Sept 27 (chunking optimization) |
| **Search Speed** | <10ms average |
| **GPU Utilization** | RTX 4080 (10x faster than CPU) |

`★ Insight ─────────────────────────────────────`
**The Blurry Line Between Work and Personal Projects:**

This episode reveals something I didn't plan to write about: the boundary between personal exploration and work preparation is fuzzy.

1. **Weekend work**: Built ChromaDB for personal vault (Sept 21-22)
2. **Monday prep**: Compared ChromaDB vs pgvector for work project (Sept 23)
3. **Tuesday demo**: Showed personal tool at work meeting (Sept 24)
4. **Friday optimization**: Scaled system for... both? (Sept 27)

Was this a personal project I happened to demo at work? Or work research I happened to do at home?

**Both.** And that's okay. The best personal projects often inform professional work. The best professional learning often happens in personal time.

Building while working a full-time job means these lines blur. Rather than pretending they're separate, this episode acknowledges the reality: innovation happens in the overlap.
`─────────────────────────────────────────────────`

## What I Learned

**1. Weekend implementation + Monday demo = Real pressure**
The BT demo deadline (Sept 24) made the weekend work (Sept 21-22) more focused. Deadlines work.

**2. Semantic search isn't optional above 100 files**
Traditional file search broke down after ~100 files. Semantic search scaled to 1,000+ effortlessly.

**3. GPU acceleration matters for experimentation speed**
10x faster embeddings meant weekend project became viable. Without RTX 4080, this would've taken weeks.

**4. Work context influences personal projects**
The pgvector comparison (Sept 23) was for work, but it made my personal ChromaDB system better. Cross-pollination is valuable.

**5. 4,840% improvement sounds impressive but...**
Going from 504 to 24,916 documents was cool, but did I need it? Sometimes optimization is just fun, not necessary.

---

## Built on Open Source

This episode wouldn't exist without incredible open source projects:

**[ChromaDB](https://github.com/chroma-core/chroma)** - The AI-native embedding database that made semantic search possible. Fast, simple, and GPU-accelerated.

**[sentence-transformers](https://github.com/UKPLab/sentence-transformers)** - Provided the embedding models (all-MiniLM-L6-v2, later mxbai-embed) that turned markdown into searchable vectors.

**[Prefect](https://github.com/PrefectHQ/prefect)** - Modern workflow orchestration that would later automate the daily indexing pipeline.

**[Obsidian](https://obsidian.md)** - The local-first knowledge management tool where this entire journey lives.

Massive thanks to these communities for building tools that let individuals create infrastructure that would have required teams just years ago.

---

## What's Next

ChromaDB was working. The vault was searchable. But a bigger question loomed:

**Where should all this infrastructure run?**

Docker Compose? Kubernetes? Something else?

By September 30, I'd be researching K3s - lightweight Kubernetes for edge computing.
By early October, I'd make an infrastructure decision.
And by October 5, that decision would crash spectacularly.

But first, the research phase.

---

*This is Episode 4 of "Season 1: From Zero to Automated Infrastructure" - documenting the weekend that transformed 1,142 files from chaos into searchable knowledge, and the blurry line between personal projects and work demos.*

*Previous Episode*: [The AI Awakening: Ollama + DeepSeek Integration](/posts/season-1-episode-3-ai-awakening)
*Next Episode*: [The Migration Question: When K3s Meets Reality](/posts/season-1-episode-5-migration-question)
*Complete Series*: [Season 1 Mapping Report](/tags/season-1/)

---
