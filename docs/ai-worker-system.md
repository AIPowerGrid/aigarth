# AIPG AI Worker System

## Overview

The AI Power Grid worker system is the core infrastructure that powers decentralized AI inference. GPU owners run worker nodes that serve AI models to users, earning AIPG tokens for providing useful compute. This creates a permissionless, censorship-resistant alternative to corporate AI APIs.

## AIPG Chat Interface

**Chat URL**: https://aipg.chat/

AIPG Chat is a beautiful, user-friendly chat interface powered by the distributed AI worker network. Built as a fork of Open WebUI, it provides a familiar ChatGPT-like experience while running entirely on decentralized infrastructure.

### Features

**Multiple AI Models**
- Access to various open-source LLMs
- Llama, Mistral, and other state-of-the-art models
- Model selection based on your needs
- Continuous expansion of available models

**Powered by Worker Nodes**
- All inference runs on community GPU nodes
- No centralized servers
- Censorship-resistant
- Truly decentralized AI

**User-Friendly Interface**
- Clean, modern design
- ChatGPT-like experience
- Conversation history
- Multi-turn dialogue support
- Code syntax highlighting
- Markdown rendering

**Open Source Foundation**
- Fork of Open WebUI (formerly Ollama WebUI)
- Customized for AIPG network
- Community contributions welcome
- Transparent development

## How the Worker System Works

### Architecture

```
User Request (aipg.chat) 
    ↓
Smart Routing Engine
    ↓
Available Worker Nodes
    ↓
AI Model Inference
    ↓
Response to User
    ↓
Worker Earns AIPG Tokens
```

### Smart Routing

The AIPG routing system intelligently matches requests to optimal workers:

**Selection Criteria**
- Model availability (worker has requested model)
- Current load (worker capacity)
- Performance metrics (speed, reliability)
- Geographic proximity (latency optimization)
- Worker reputation score

**Load Balancing**
- Distributes requests across multiple workers
- Prevents single-node bottlenecks
- Ensures high availability
- Optimizes for speed and reliability

### Worker Node Types

**GPU Workers**
- Run AI models (LLMs, Stable Diffusion, etc.)
- Serve inference requests
- Earn AIPG for completed work
- Range from gaming PCs to data center GPUs

**Model Support**
- Large Language Models (LLMs)
- Image generation (Stable Diffusion)
- Custom fine-tuned models
- Multi-modal models (future)

## Worker Types

AIPG supports two types of AI workers, each with dedicated setup guides:

### Text Workers (LLMs)

Run Large Language Models for chat and text generation.

**Quick Overview**:
- Models: Llama, Mistral, Mixtral, Qwen, etc.
- Minimum GPU: GTX 1660 (6GB VRAM)
- Software: Text Worker Bridge or OmniForge
- Formats: GGUF, Safetensors

**📖 Full Guide**: See [TEXT_WORKER_GUIDE.md](./TEXT_WORKER_GUIDE.md)

### Image Workers (Stable Diffusion)

Generate AI art using Stable Diffusion models.

**Quick Overview**:
- Models: SD 1.5, SDXL, Flux, custom checkpoints
- Minimum GPU: GTX 1660 (6GB VRAM)
- Software: AIPG Image Worker
- Features: LoRA, ControlNet, upscaling

**📖 Full Guide**: See [IMAGE_WORKER_GUIDE.md](./IMAGE_WORKER_GUIDE.md)

### Video Workers (Coming Soon)

Generate AI video content - currently in development.

**Requirements**:
- Enterprise GPUs (H100, B100, Blackwell, RTX 5090)
- 40GB+ VRAM for quality results
- Expected: Q1-Q2 2026

## General Requirements

**All Worker Types Need**:
- NVIDIA GPU (AMD experimental for some)
- 16GB+ RAM (32GB+ recommended)
- SSD storage (100GB+ for models)
- Stable internet (10+ Mbps upload)
- 80%+ uptime recommended

### Setup Process

#### Option 1: Text Worker Bridge (Recommended for Scale)

**GitHub**: https://github.com/AIPowerGrid/text-worker-bridge

The Text Worker Bridge allows you to connect any OpenAI or KoboldAI compatible API to the AIPG network. This is the most flexible and scalable option.

**Supported Endpoints**
- Ollama (local LLM server)
- vLLM (high-performance inference)
- Aphrodite Engine (optimized serving)
- KoboldAI / KoboldCpp
- OpenAI API (or compatible)
- Any other OpenAI-compatible endpoint

**Setup Steps**
1. Install dependencies: `pip install -r requirements.txt`
2. Copy `bridgeData_template.yaml` to `bridgeData.yaml`
3. Configure your endpoints and models
4. Run: `python start_worker.py`

**Configuration Example**
```yaml
# Global settings
horde_url: "https://api.aipowergrid.io/"
api_key: "your-api-key-here"
queue_size: 0

# Example: Connect local Ollama
endpoints:
  - type: "openai"
    name: "local-ollama"
    url: "http://localhost:11434/v1"
    models:
      - name: "llama3-worker"
        model: "llama3"
        max_threads: 2
        max_length: 2048
        max_context_length: 8192
```

**Advantages**
- Connect existing inference servers
- Support multiple endpoints simultaneously
- High performance and scalability
- Production-ready for serious workers
- Flexible configuration

#### Option 2: OmniForge (User-Friendly GGUF)

**GitHub**: https://github.com/AIPowerGrid/omniforge

OmniForge provides a more user-friendly experience for running GGUF models directly. It's based on KoboldCpp and includes a web UI.

**Features**
- Easy-to-use web interface
- Direct GGUF model support
- Automatic grid integration
- No complex configuration needed
- Built-in model management

**Supported Models**
- Llama / Llama2 / Llama3
- Mistral / Mixtral / Miqu
- Qwen / Qwen2 / Yi
- Gemma / Gemma2
- Phi-2 / Phi-3
- GPT-2 / GPT-J / GPT-NeoX
- And hundreds more GGUF models

**Setup Steps**
1. Download OmniForge from GitHub
2. Download GGUF model files (from HuggingFace)
3. Launch OmniForge with your model
4. Connect to AIPG network
5. Start earning!

**Trade-offs**
- ✅ More user-friendly
- ✅ No configuration files needed
- ✅ Built-in web UI
- ❌ Slower than optimized inference servers
- ❌ Less suitable for high-scale operations
- ❌ Single model per instance

**When to Use Each**
- **Text Worker Bridge**: Production workers, multiple models, existing infrastructure, maximum performance
- **OmniForge**: Beginners, single model, ease of use, casual workers

### Where to Download Models

**Text Models (GGUF Format)**
- **HuggingFace**: Primary source for GGUF models
  - Airoboros Mistral 7B (smaller, good for beginners)
  - Tiefighter 13B (medium size, balanced)
  - Beepo 22B (large, most powerful)
  - Search for "GGUF" on HuggingFace for thousands more

**Popular Model Recommendations**
- **Llama 3 8B**: Fast, efficient, great quality
- **Mistral 7B**: Excellent performance-to-size ratio
- **Mixtral 8x7B**: Powerful mixture-of-experts model
- **Qwen 2 Series**: Strong multilingual support
- **Phi-3**: Microsoft's efficient small models

**Model Formats**
- **GGUF**: Universal format, works with OmniForge and most tools
- **Safetensors**: For vLLM, Aphrodite, and other Python-based servers
- **GGML**: Legacy format (use GGUF instead)

**Quantization Levels**
- **Q4_K_M**: Good balance of speed and quality (recommended)
- **Q5_K_M**: Higher quality, slightly slower
- **Q8_0**: Near-original quality, slower
- **Q2/Q3**: Fastest but lower quality

### Worker Economics

**Payment Model**
- Pay-per-inference basis
- Rates based on model complexity
- Instant payment upon completion
- No minimum payout threshold

**Earning Potential**
- Varies by GPU power and uptime
- More powerful GPUs earn more
- Popular models generate more requests
- 24/7 operation maximizes earnings

**Earnings Information**
- Earnings vary significantly based on network demand, GPU performance, uptime, and configuration
- Contact the community on Discord for real earnings data from active workers
- Factors include: model type, generation speed, network conditions, and availability

## Worker Infrastructure

### Distributed Network

**Global Coverage**
- Workers across multiple continents
- Redundancy and fault tolerance
- No single point of failure
- 24/7 availability

**Scalability**
- Add workers as demand grows
- Horizontal scaling
- No centralized bottlenecks
- Unlimited growth potential

### Quality Assurance

**Worker Verification**
- Proof of GPU capability
- Performance benchmarking
- Uptime monitoring
- Quality scoring system

**Reputation System**
- Workers earn reputation through reliable service
- Higher reputation = more requests
- Poor performance reduces reputation
- Incentivizes quality service

### Security

**Request Validation**
- Input sanitization
- Rate limiting
- Anti-abuse measures
- DDoS protection

**Worker Authentication**
- Cryptographic signatures
- Secure communication channels
- Payment verification
- Fraud prevention

## Supported AI Models

### Large Language Models (LLMs)

**Llama Family**
- Llama 2 (7B, 13B, 70B)
- Llama 3 variants
- Code Llama for programming
- Specialized fine-tunes

**Mistral Models**
- Mistral 7B
- Mixtral 8x7B (MoE)
- Mistral variants
- Instruction-tuned versions

**Other Open Source LLMs**
- Falcon models
- MPT models
- Vicuna and derivatives
- Community fine-tunes

### Image Generation

**Stable Diffusion**
- SD 1.5
- SDXL
- Custom checkpoints
- LoRA models
- ControlNet support

**Specialized Models**
- Anime/art styles
- Photorealistic models
- Concept art models
- Custom trained models

### Future Model Support

**Coming Soon**
- Multi-modal models (text + image)
- Audio generation (music, speech)
- Video generation
- Code generation specialists
- Domain-specific models (medical, legal, etc.)

## Using AIPG Chat

### Getting Started

1. **Visit https://aipg.chat/**
2. **Select a Model**
   - Choose from available LLMs
   - Consider speed vs quality tradeoff
3. **Start Chatting**
   - Type your message
   - Receive AI-generated responses
   - Continue conversation naturally

### Features and Tips

**Conversation Management**
- Create new conversations
- Save important chats
- Export conversation history
- Search through past chats

**Advanced Features**
- System prompts for customization
- Temperature and parameter controls
- Token limit adjustments
- Model switching mid-conversation

**Best Practices**
- Clear, specific prompts get best results
- Provide context for complex questions
- Use markdown for formatting
- Break complex tasks into steps

## Developer Integration

### API Access

Developers can integrate AIPG's AI inference into their applications:

**Endpoints**
- RESTful API for LLM inference
- Image generation API
- WebSocket for streaming responses
- Batch processing endpoints

**Authentication**
- API key based
- AIPG token payment
- Rate limiting per tier
- Usage analytics

**Example Integration**
```javascript
// Simple LLM inference request
const response = await fetch('https://api.aipowergrid.io/v1/inference', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'llama-2-7b',
    prompt: 'Explain quantum computing',
    max_tokens: 500
  })
});

const result = await response.json();
console.log(result.text);
```

### SDK Support

**Official SDKs**
- JavaScript/TypeScript
- Python
- Go
- Rust

**Community SDKs**
- Java
- C#/.NET
- Ruby
- PHP

## Worker vs Traditional Mining

### AIPG Worker Model

**Advantages**
- ✅ Useful compute (AI inference)
- ✅ Real value created for users
- ✅ Energy produces actual services
- ✅ No specialized hardware needed
- ✅ Earn while helping others
- ✅ Sustainable and productive

**Economics**
- Payment for useful work
- Market-driven rates
- Direct user-to-worker value exchange
- No wasteful energy consumption

### Traditional Crypto Mining

**Drawbacks**
- ❌ Wasteful proof-of-work hashing
- ❌ No productive output
- ❌ Massive energy waste
- ❌ Requires specialized ASICs
- ❌ Centralized mining pools
- ❌ Environmental concerns

**Economics**
- Inflationary token emissions
- Race to bottom on efficiency
- Centralization over time
- Unsustainable long-term

## Worker Network Statistics

### Real-Time Metrics

**Network Health**
- Total active workers
- Available models
- Average response time
- Success rate
- Geographic distribution

**Usage Statistics**
- Requests per day
- Popular models
- Peak usage times
- User growth trends

**Worker Earnings**
- Total AIPG distributed
- Average earnings per worker
- Top earning workers
- Payment distribution

## Roadmap and Future Development

### Q4 2025

**Enhanced Worker Features**
- Improved routing algorithms
- Better load balancing
- Enhanced monitoring tools
- Worker dashboard improvements

**Model Expansion**
- More LLM options
- Advanced image models
- Multi-modal support
- Custom model uploads

### Q1 2026

**Advanced Capabilities**
- Video generation support
- Audio/music generation
- Real-time voice AI
- Specialized domain models

**Infrastructure**
- Cross-chain worker payments
- Enhanced security features
- Better scalability
- Geographic optimization

### Long-Term Vision

**Global AI Utility**
- Thousands of worker nodes worldwide
- Millions of daily inference requests
- Leading decentralized AI infrastructure
- Enterprise adoption

**Innovation**
- Cutting-edge model support
- Novel AI applications
- Research partnerships
- Academic collaborations

## Community and Support

### For Workers

**Documentation**
- Setup guides
- Troubleshooting
- Optimization tips
- Best practices

**Support Channels**
- Discord #workers channel
- Telegram worker group
- GitHub issues
- Email support

**Community**
- Worker forums
- Earnings discussions
- Hardware recommendations
- Optimization sharing

### For Users

**Help Resources**
- AIPG Chat tutorials
- Model selection guide
- Prompt engineering tips
- API documentation

**Community**
- Discord #support
- Telegram user group
- Twitter updates
- Reddit discussions

## Technical Specifications

### Worker Node Requirements

| Component | Minimum | Recommended | Optimal |
|-----------|---------|-------------|---------|
| GPU | GTX 1660 | RTX 3060 | RTX 4090 |
| VRAM | 6GB | 12GB | 24GB+ |
| RAM | 16GB | 32GB | 64GB+ |
| Storage | 100GB | 500GB | 1TB+ |
| Upload | 5 Mbps | 10 Mbps | 50+ Mbps |
| Uptime | 50% | 80% | 95%+ |

### Supported Models by GPU

**6-8GB VRAM**
- Llama 2 7B
- Mistral 7B
- SD 1.5
- Small fine-tunes

**12-16GB VRAM**
- Llama 2 13B
- Mixtral 8x7B (quantized)
- SDXL
- Most open-source models

**24GB+ VRAM**
- Llama 2 70B
- Large Mixtral variants
- Multiple models simultaneously
- Custom enterprise models

## Conclusion

The AIPG AI worker system represents a paradigm shift in how AI compute is provided and consumed. By turning idle GPUs into productive AI inference nodes, AIPG creates a sustainable, decentralized alternative to corporate AI gatekeepers.

Whether you're a GPU owner looking to monetize your hardware, a developer building AI applications, or a user seeking uncensored access to powerful AI models, the AIPG worker network provides the infrastructure for a truly open AI future.

**Get Started**:
- **Use AI**: https://aipg.chat/
- **Become a Worker**: Check GitHub for setup guides
- **Build Apps**: Integrate AIPG API into your projects
- **Join Community**: Discord, Telegram, Twitter

Together, we're building the decentralized AI infrastructure that will power the next generation of human creativity and productivity.

