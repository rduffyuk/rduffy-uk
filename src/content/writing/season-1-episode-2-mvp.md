---
author: Ryan Duffy
featured: false
categories:
- Season 1
- ConvoCanvas
- Development
pubDatetime: 2025-10-05 10:00:00+00:00
draft: false
episode: 2
reading_time: 8 minutes
series: 'Season 1: From Zero to Automated Infrastructure'
description: From vault design to working code. September 14-15, 2025 - vault creation, LibreChat deployment, and the first FastAPI backend that could parse conversations and generate content ideas.
tags:
- convocanvas
- fastapi
- mvp
- python
- development
- librechat
- pydantic
- collaboration
title: 'Building the Foundation: Vault Creation to MVP'
word_count: 1900
---
# Episode 2: Building the Foundation - Vault Creation to MVP

**Series**: Season 1 - From Zero to Automated Infrastructure
**Episode**: 2 of 8
**Dates**: September 14-15, 2025
**Reading Time**: 8 minutes

---

## 🌅 September 14, Morning - Vault Creation

*Vault Evidence: First vault file created September 14, 2025 at 21:33 (`Sync-Password.md`). This marks the actual start of the Obsidian vault - the physical implementation of the design created on September 11.*

Three days after the planning session with Claude, I created the actual Obsidian vault.

**September 11**: The idea and design (with Claude)
**September 14**: The implementation begins

**What happened September 12-13?**

Honestly? I don't know. The vault didn't exist yet, so no files were created. Likely:
- Work at BT (day job reality)
- Mental processing of the design
- Maybe local development without documentation
- Life happening between idea and execution

**The gap between planning and implementation is real.** This wasn't a sprint from idea to code - it was three days of normal life with a full-time job before I had time to start building.

## 📦 September 14, Afternoon - LibreChat Deployment

*Vault Evidence: `archived-20250916-1559_2025-09-14_convocanvas-backend-testing-infrastructure.md` and `BLOG-SERIES-SEASON-1-COMPLETE-MAPPING-2025-10-05.md` confirm September 14 LibreChat work.*

While setting up the vault, I realized ConvoCanvas would need a testing environment. I deployed LibreChat - a self-hosted ChatGPT alternative.

```bash
# LibreChat Docker setup
git clone https://github.com/danny-avila/LibreChat.git
cd LibreChat
docker-compose up -d

# Services running:
# LibreChat UI: http://localhost:3080
# MongoDB: localhost:27017 (persistence)
# LM Studio integration: Local models
```

**Why LibreChat?**
- Self-hosted (privacy-first)
- Multiple AI provider support (Claude, ChatGPT, local models)
- Conversation export functionality
- Testing ground for ConvoCanvas parsing

By evening, LibreChat was running. I had a conversation testing environment.

## 💻 September 15 - The MVP Build

*Vault Evidence: `archived-20250916-1559_2025-09-15_convocanvas.md` documents September 15 ConvoCanvas work including FastAPI backend development and CI/CD pipeline setup.*

Sunday morning. Time to build the actual ConvoCanvas backend.

**The Stack** (working with Claude Code):
- **FastAPI** 0.116.1 - Async from day one
- **Pydantic** 2.11.9 - Type safety
- **Python 3.11** - Latest stable
- **uvicorn** - ASGI server

**The Goal**: Upload conversation → Get content ideas

That's the MVP. Nothing more.

```
┌──────────────────────────────────────────────────────────────┐
│              FastAPI MVP Pipeline - Sept 15, 2025            │
│            (Built collaboratively with Claude Code)          │
└──────────────────────────────────────────────────────────────┘

 📤 Upload              🔍 Parse               ⚙️ Analyze              📝 Generate
Conversation    →    Extract Text     →    Find Insights    →    Create Content
   File              (Parser Module)       (Analyzer Module)      (Generator Module)
                                                                        │
                                                                        ▼
                                                                   ✨ Output
                                                              • LinkedIn posts
                                                              • Blog drafts
                                                              • Code snippets
                                                              • Learning points
```

## 🏗️ The Architecture - Designed with Claude

Working with Claude Code, we built the backend with proper separation of concerns.

**Before** (if I'd coded solo):
```python
@app.post("/upload")
async def upload_conversation(file: UploadFile):
    content = await file.read()
    # ... 50 lines of parsing logic
    # ... error handling with print()
    # ... analysis mixed with parsing
    return {"ideas": ideas}
```

**After** (collaborating with Claude):
```python
@app.post("/upload")
async def upload_conversation(file: UploadFile):
    try:
        parser = ConversationParser()
        analyzer = ContentAnalyzer()

        content = await file.read()
        conversation = parser.parse(content)
        ideas = analyzer.generate_ideas(conversation)

        return ConversationResponse(
            status="success",
            conversation_id=conversation.id,
            content_ideas=ideas
        )
    except ParseError as e:
        raise HTTPException(status_code=400, detail=str(e))
```

**Clean separation**:
- `ConversationParser` - Handles Save My Chatbot format
- `ContentAnalyzer` - Extracts insights
- `ConversationResponse` - Type-safe response model
- Proper HTTP error handling

**This architecture came from collaboration** - Claude understanding patterns, me understanding the problem, together creating something better than either alone.

## 🔍 The Parser - Understanding Conversation Format

Save My Chatbot exports look like this:

```markdown
## 👤 User
How do I deploy K3s on Ubuntu?

---

## 🤖 Claude
Here's how to deploy K3s...

---
```

Working with Claude, we built a parser that could handle this:

```python
class ConversationParser:
    def parse(self, content: str) -> Conversation:
        """Parse Save My Chatbot markdown format."""
        messages = []
        current_role = None
        current_text = []

        for line in content.split('\n'):
            if line.startswith('## 👤 User'):
                if current_role:
                    messages.append(Message(
                        role=current_role,
                        content='\n'.join(current_text).strip()
                    ))
                current_role = "user"
                current_text = []
            elif line.startswith('## 🤖 Claude'):
                if current_role:
                    messages.append(Message(
                        role=current_role,
                        content='\n'.join(current_text).strip()
                    ))
                current_role = "assistant"
                current_text = []
            elif line.strip() != '---':
                current_text.append(line)

        # Don't forget the last message
        if current_role:
            messages.append(Message(
                role=current_role,
                content='\n'.join(current_text).strip()
            ))

        return Conversation(messages=messages)
```

**Simple. Reliable. Handles edge cases.**

## ✨ The Content Analyzer - Extracting Value

The analyzer scans parsed conversations for:

1. **Technical insights** - Code snippets, commands, configurations
2. **Problem-solving patterns** - How issues were debugged
3. **Learning moments** - Concepts explained
4. **Content opportunities** - Topics worth sharing

```python
class ContentAnalyzer:
    def generate_ideas(self, conversation: Conversation) -> List[ContentIdea]:
        ideas = []

        # Find code blocks
        code_snippets = self._extract_code(conversation)
        if code_snippets:
            ideas.append(ContentIdea(
                type="tutorial",
                title=f"Code Tutorial: {self._infer_topic(code_snippets)}",
                content=code_snippets
            ))

        # Find technical discussions
        technical_terms = self._extract_technical_terms(conversation)
        if len(technical_terms) > 5:
            ideas.append(ContentIdea(
                type="linkedin-post",
                title=f"Technical Deep Dive: {', '.join(technical_terms[:3])}",
                concepts=technical_terms
            ))

        # Find problem-solution patterns
        problems = self._extract_problems(conversation)
        if problems:
            ideas.append(ContentIdea(
                type="blog-post",
                title="Debugging Journey",
                challenges=problems
            ))

        return ideas
```

**The analyzer turns raw conversation text into structured content opportunities.**

## 🎉 September 15, Evening - First Successful Test

Working with Claude throughout the day, by evening we had a working MVP.

**Test**: Upload a conversation about K3s debugging

**Result**:
```json
{
  "status": "success",
  "conversation_id": "conv_20250915_001",
  "content_ideas": [
    {
      "type": "linkedin-post",
      "title": "K3s Debugging: When pod restarts exceed 1000",
      "concepts": ["kubernetes", "k3s", "debugging", "networking"]
    },
    {
      "type": "tutorial",
      "title": "Code Tutorial: K3s Network Troubleshooting",
      "content": "kubectl get pods -A\nkubectl logs..."
    },
    {
      "type": "blog-post",
      "title": "Debugging Journey: K3s crash resolution",
      "challenges": ["DNS resolution failure", "CoreDNS crash loop"]
    }
  ]
}
```

**6 content ideas from 1 conversation.**

The system worked.

## What Worked

**Collaboration with Claude**: This wasn't solo coding. Every architectural decision, every error handling pattern, every parser edge case - discussed with Claude, implemented together.

**Vault-First Development**: Creating the vault on September 14 gave the project a home. Files had a place to live.

**Proper Architecture**: Parser → Analyzer → Generator separation meant each component could be tested and improved independently.

**Type Safety**: Pydantic models caught errors at development time, not runtime.

## What Didn't Work

**Testing Coverage**: We built the MVP without comprehensive tests. It worked, but we didn't know *why* it would keep working.

**Edge Cases**: The parser handled standard Save My Chatbot format perfectly. Non-standard formats? Crashes.

**Performance**: No thought given to large conversations (1000+ messages). Would it scale?

## The Numbers (September 14-15, 2025)

| Metric | Value |
|--------|-------|
| **Development Days** | 2 (Sept 14-15) |
| **Vault Creation** | Sept 14, 21:33 |
| **Services Deployed** | 2 (LibreChat, FastAPI) |
| **Code Lines Written** | ~300 (parser + analyzer + routes) |
| **Test Conversations Processed** | 3 |
| **Content Ideas Generated** | 18 (from 3 conversations) |
| **First Successful Parse** | Sept 15, evening |

`★ Insight ─────────────────────────────────────`
**The Value of Collaborative Development:**

Building ConvoCanvas wasn't solo work. It was collaboration:
- Claude Code provided architectural patterns and best practices
- I provided domain knowledge (conversation formats, content types)
- Together we created something neither would have built alone

**The 3-day gap from planning (Sept 11) to implementation (Sept 14) is honest reality:**
- Full-time job at BT
- Life between idea and execution
- Processing time before building

**Not every day is a development day. That's okay.**

Real projects happen around real life. The honest timeline shows the messy reality of personal projects built while working full-time.
`─────────────────────────────────────────────────`

## What I Learned

**1. Gaps between planning and implementation are normal**
September 11: Planning session
September 12-13: Life happened, day job continued
September 14: Implementation started

**2. Vault creation is the real "Day One"**
September 14, 21:33 - First file created. That's when the project physically existed.

**3. MVP means "works once successfully"**
18 content ideas from 3 conversations = proof of concept. Not production-ready, but concept proven.

**4. Collaboration > Solo coding**
Working with Claude Code meant better architecture, cleaner code, and faster development than I'd achieve alone.

**5. Test environments matter**
LibreChat gave us a real conversation source to test against. Real data beats synthetic tests.

## Built on Open Source

This MVP wouldn't exist without:

**[FastAPI](https://github.com/tiangolo/fastapi)** - Modern, fast web framework that made async Python actually enjoyable.

**[Pydantic](https://github.com/pydantic/pydantic)** - Data validation using Python type hints that caught errors before runtime.

**[LibreChat](https://github.com/danny-avila/LibreChat)** - Self-hosted AI chat interface that provided our testing environment.

**[Save My Chatbot](https://github.com/jasonppy/save-my-chatbot)** - Browser extension that made conversation export possible.

Massive thanks to all maintainers. Your work enables projects like ConvoCanvas.

## What's Next

September 15 ended with a working MVP. Upload conversation → Get content ideas.

**But one problem remained unsolved**: The original context window overflow error that started this whole journey.

ConvoCanvas could organize *past* conversations. But hitting context limits on *new* conversations? Still happening.

**The solution would require local AI. Unlimited control. No external limits.**

By September 18-19, I'd be installing Ollama and 17 local models. The context window problem was about to meet its match.

---

*This is Episode 2 of "Season 1: From Zero to Automated Infrastructure" - documenting the weekend that turned vault design into working code.*

*Previous Episode*: [Day Zero: The ConvoCanvas Vision](/posts/season-1-episode-1-day-zero)
*Next Episode*: [The AI Awakening: Breaking Free from Context Limits](/posts/season-1-episode-3-ai-awakening)
*Complete Series*: [Season 1 Mapping Report](/tags/season-1/)

---
