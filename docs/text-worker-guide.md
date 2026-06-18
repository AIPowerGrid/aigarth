# AIPG Text Worker Guide

## Overview

Text workers run Large Language Models (LLMs) and earn AIPG tokens by providing AI inference services to users on the AIPG network. This guide covers everything you need to become a text worker and start earning.

## What is a Text Worker?

A text worker is a node in the AIPG distributed AI network that:
- Runs LLM models (Llama, Mistral, etc.)
- Serves chat and text generation requests
- Earns AIPG tokens for completed inference
- Contributes to decentralized AI infrastructure

## Hardware Requirements

### Minimum Specifications
- **GPU**: NVIDIA GTX 1660 (6GB VRAM)
- **RAM**: 16GB system RAM
- **Storage**: 50GB free space
- **Internet**: 5 Mbps upload speed
- **OS**: Windows or Linux

### Recommended Specifications
- **GPU**: NVIDIA RTX 3060 (12GB VRAM) or better
- **RAM**: 32GB system RAM
- **Storage**: 200GB SSD
- **Internet**: 10+ Mbps upload speed
- **OS**: Linux (Ubuntu/Debian) for best performance

### Optimal Setup
- **GPU**: NVIDIA RTX 4090 (24GB VRAM)
- **RAM**: 64GB+ system RAM
- **Storage**: 500GB+ NVMe SSD
- **Internet**: 50+ Mbps upload speed
- **Uptime**: 95%+ availability

## Worker Software Options

### Option 1: Text Worker Bridge (Recommended)

**GitHub**: https://github.com/AIPowerGrid/text-worker-bridge

The Text Worker Bridge is the most flexible and scalable option, allowing you to connect any OpenAI or KoboldAI compatible API to the AIPG network.

#### Supported Backends

**Local Inference Servers**
- **Ollama**: Easy-to-use local LLM server
- **vLLM**: High-performance inference engine
- **Aphrodite Engine**: Optimized for speed and efficiency
- **KoboldAI / KoboldCpp**: Popular local AI server
- **LM Studio**: User-friendly GUI-based server
- **text-generation-webui (oobabooga)**: Feature-rich web interface

**Cloud/Remote APIs**
- OpenAI API
- Any OpenAI-compatible endpoint
- Custom inference servers

#### Installation Steps

1. **Clone the Repository**
```bash
git clone https://github.com/AIPowerGrid/text-worker-bridge
cd text-worker-bridge
```

2. **Install Dependencies**
```bash
pip install -r requirements.txt
```

3. **Configure Your Worker**

Copy the template configuration:
```bash
cp bridgeData_template.yaml bridgeData.yaml
```

Edit `bridgeData.yaml`:
```yaml
# Global settings
horde_url: "https://api.aipowergrid.io/"
api_key: "your-aipg-api-key-here"
queue_size: 0  # 0 for unlimited

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

# Example: Connect vLLM server
  - type: "openai"
    name: "vllm-server"
    url: "http://localhost:8000/v1"
    models:
      - name: "mistral-7b-worker"
        model: "mistralai/Mistral-7B-Instruct-v0.2"
        max_threads: 4
        max_length: 4096
        max_context_length: 32768
```

4. **Start the Worker**
```bash
python start_worker.py
```

#### Configuration Options

**Global Settings**
- `horde_url`: AIPG API endpoint (https://api.aipowergrid.io/)
- `api_key`: Your AIPG API key from the website
- `queue_size`: Request queue size (0 = unlimited)

**Endpoint Settings**
- `type`: API type ("openai" or "koboldai")
- `name`: Unique endpoint identifier
- `url`: Base URL of your inference server
- `api_key`: API key if required (for OpenAI-compatible endpoints)

**Model Settings**
- `name`: Worker instance name (must be unique)
- `model`: Model identifier (for OpenAI-compatible endpoints)
- `max_threads`: Number of concurrent requests
- `max_length`: Maximum tokens to generate
- `max_context_length`: Maximum input context size

#### Advantages
- ✅ Connect existing inference infrastructure
- ✅ Support multiple endpoints simultaneously
- ✅ High performance and scalability
- ✅ Production-ready for serious workers
- ✅ Flexible configuration
- ✅ Works with any OpenAI/KoboldAI compatible API

### Option 2: OmniForge (User-Friendly)

**GitHub**: https://github.com/AIPowerGrid/omniforge

OmniForge provides a more user-friendly experience for running GGUF models directly. It's based on KoboldCpp and includes a web UI for easy management.

#### Features
- Easy-to-use web interface
- Direct GGUF model support
- Automatic AIPG grid integration
- No complex configuration files
- Built-in model management
- One-click setup

#### Supported Models
- Llama / Llama 2 / Llama 3
- Mistral / Mixtral / Miqu
- Qwen / Qwen 2 / Yi
- Gemma / Gemma 2
- Phi-2 / Phi-3
- GPT-2 / GPT-J / GPT-NeoX
- And hundreds more GGUF models

#### Installation Steps

1. **Download OmniForge**
```bash
git clone https://github.com/AIPowerGrid/omniforge
cd omniforge
```

2. **Download a GGUF Model**

Visit HuggingFace and download a GGUF model file. Popular choices:
- Llama 3 8B Q4_K_M
- Mistral 7B Q4_K_M
- Mixtral 8x7B Q4_K_M

3. **Launch OmniForge**
```bash
# Example: Run with Llama 3
./omniforge --model llama-3-8b-q4_k_m.gguf --aipg-mode
```

4. **Access Web UI**

Open your browser to `http://localhost:5001` to configure AIPG integration and start earning.

#### Trade-offs

**Advantages**
- ✅ More user-friendly
- ✅ No configuration files needed
- ✅ Built-in web UI
- ✅ Perfect for beginners
- ✅ Quick setup

**Disadvantages**
- ❌ Slower than optimized inference servers (vLLM, Aphrodite)
- ❌ Less suitable for high-scale operations
- ❌ Single model per instance
- ❌ Limited to GGUF format

#### When to Use OmniForge
- You're new to running AI workers
- You want a simple, one-model setup
- You prefer a GUI over configuration files
- You're running casually, not 24/7
- You don't need maximum performance

## Choosing and Downloading Models

### Where to Get Models

**HuggingFace (Primary Source)**
- Search for "GGUF" to find compatible models
- Look for quantized versions (Q4_K_M, Q5_K_M, etc.)
- Download `.gguf` files for OmniForge
- Download safetensors for vLLM/Aphrodite

**Popular Model Repositories**
- TheBloke (prolific GGUF converter)
- Meta Llama models
- Mistral AI official models
- Community fine-tunes

### Recommended Models by GPU

**Current Popular Models**
- **GLM 4.6**: Latest GLM model
- **MiniMax M2**: High-quality generation
- **OpenAI OSS 120B**: Large open-source model
- **OpenAI OSS 20B**: Medium-sized efficient model
- **Qwen3 A3B**: Latest Qwen 3 series
- **Qwen3 Coder**: Specialized for code generation
- **DeepSeek**: Strong reasoning capabilities

**By VRAM Capacity**

**6-8GB VRAM**
- Qwen3 A3B Q4_K_M
- Smaller quantized models

**12-16GB VRAM**
- OpenAI OSS 20B Q4_K_M
- Qwen3 Coder Q4_K_M
- DeepSeek Q4_K_M

**24GB+ VRAM**
- OpenAI OSS 120B Q4_K_M
- GLM 4.6 Q4_K_M
- MiniMax M2 Q4_K_M
- Multiple models simultaneously

### Model Formats Explained

**GGUF (Recommended for OmniForge)**
- Universal format
- CPU + GPU hybrid inference
- Quantized for efficiency
- Easy to use

**Safetensors (For vLLM/Aphrodite)**
- PyTorch format
- GPU-only inference
- Maximum performance
- Larger file sizes

**Quantization Levels**
- **Q2/Q3**: Fastest, lowest quality
- **Q4_K_M**: Best balance (recommended)
- **Q5_K_M**: Higher quality, slightly slower
- **Q6_K**: Near-original quality
- **Q8_0**: Minimal quality loss
- **F16/F32**: Full precision (huge files)

### Model Selection Tips

1. **Match to Your GPU**: Don't exceed VRAM capacity
2. **Consider Context Length**: Longer context = more VRAM
3. **Balance Speed vs Quality**: Q4_K_M is usually optimal
4. **Test Before Committing**: Try models before running 24/7
5. **Popular = More Requests**: Well-known models get more work

## Earnings and Economics

### Payment Model

**How You Earn**
- Pay-per-inference basis
- Instant payment upon job completion
- Rates based on model size and complexity
- No minimum payout threshold

**Factors Affecting Earnings**
- GPU performance (faster = more jobs)
- Model popularity (popular models get more requests)
- Uptime (24/7 operation maximizes earnings)
- Network demand (varies by time of day)
- Context length and generation length

### Earnings

Earnings vary significantly based on:
- Network demand for AI services
- Your GPU performance and speed
- Model popularity and availability
- Uptime and reliability
- Context length and generation parameters
- Network conditions

Contact the community on Discord for real worker earnings data and experiences from active workers.

### Maximizing Earnings

**Optimization Tips**
1. **Run 24/7**: Maximize uptime for consistent earnings
2. **Popular Models**: Llama 3, Mistral, Mixtral get more requests
3. **Fast Hardware**: SSD, good CPU, fast RAM help
4. **Stable Internet**: Minimize disconnections
5. **Multiple Models**: Serve several models if you have VRAM
6. **Optimize Settings**: Balance speed vs quality for your hardware

## Setup Guides by Backend

### Ollama Setup

1. **Install Ollama**
```bash
# Linux
curl -fsSL https://ollama.com/install.sh | sh

# macOS
brew install ollama

# Windows
# Download from ollama.com
```

2. **Pull Models**
```bash
ollama pull llama3
ollama pull mistral
ollama pull mixtral
```

3. **Start Ollama Server**
```bash
ollama serve
```

4. **Configure Text Worker Bridge**

Point to `http://localhost:11434/v1` in your `bridgeData.yaml`

### vLLM Setup

1. **Install vLLM**
```bash
pip install vllm
```

2. **Start vLLM Server**
```bash
python -m vllm.entrypoints.openai.api_server \
    --model mistralai/Mistral-7B-Instruct-v0.2 \
    --dtype auto \
    --api-key your-api-key
```

3. **Configure Text Worker Bridge**

Point to `http://localhost:8000/v1` in your `bridgeData.yaml`

### Aphrodite Engine Setup

1. **Install Aphrodite**
```bash
pip install aphrodite-engine
```

2. **Start Aphrodite Server**
```bash
aphrodite run mistralai/Mistral-7B-Instruct-v0.2 \
    --port 8000 \
    --api-key your-api-key
```

3. **Configure Text Worker Bridge**

Point to `http://localhost:8000/v1` in your `bridgeData.yaml`

### KoboldCpp Setup

1. **Download KoboldCpp**

Visit https://github.com/LostRuins/koboldcpp/releases

2. **Run with Model**
```bash
./koboldcpp --model llama-3-8b-q4_k_m.gguf --port 5001
```

3. **Configure Text Worker Bridge**

Use `type: "koboldai"` and point to `http://localhost:5001`

## Monitoring and Maintenance

### Checking Worker Status

**Text Worker Bridge**
- Monitor terminal output for job completions
- Check `logs/` directory for detailed logs
- Watch for error messages

**OmniForge**
- Access web UI at `http://localhost:5001`
- View real-time statistics
- Check connection status

### Common Issues

**Worker Not Receiving Jobs**
- Verify API key is correct
- Check internet connection
- Ensure model names are unique
- Confirm GPU is detected

**Out of Memory Errors**
- Reduce `max_threads`
- Use smaller models
- Lower `max_context_length`
- Close other applications

**Slow Performance**
- Use SSD instead of HDD
- Increase system RAM
- Use quantized models (Q4_K_M)
- Optimize inference backend settings

**Connection Issues**
- Check firewall settings
- Verify AIPG API endpoint
- Test local inference server first
- Review network logs

### Performance Optimization

**System Level**
- Disable power saving modes
- Close unnecessary applications
- Use dedicated GPU for inference
- Ensure adequate cooling

**Software Level**
- Use latest worker version
- Update inference backend regularly
- Optimize model quantization
- Configure thread counts appropriately

## Best Practices

### Security

- **Never share your API key**
- Keep worker software updated
- Use strong passwords for web UIs
- Monitor for unusual activity
- Backup configuration files

### Reliability

- **Maintain high uptime** (80%+ recommended)
- Monitor system resources
- Set up automatic restarts
- Keep logs for troubleshooting
- Test after updates

### Community

- Join AIPG Discord for support
- Share optimization tips
- Report bugs and issues
- Contribute to documentation
- Help other workers

## Troubleshooting

### Getting Help

**Discord Channels**
- `#text-workers`: General text worker discussion
- `#support`: Technical support
- `#worker-setup`: Setup assistance

**GitHub Issues**
- Text Worker Bridge: https://github.com/AIPowerGrid/text-worker-bridge/issues
- OmniForge: https://github.com/AIPowerGrid/omniforge/issues

**Resources**
- Worker documentation
- Community guides
- Video tutorials (coming soon)
- FAQ section

### Common Error Messages

**"API Key Invalid"**
- Double-check your API key
- Ensure no extra spaces
- Regenerate key if needed

**"Model Not Found"**
- Verify model name in config
- Check model is downloaded
- Confirm inference server is running

**"Connection Refused"**
- Inference server not running
- Wrong URL in configuration
- Firewall blocking connection

**"CUDA Out of Memory"**
- Model too large for GPU
- Reduce max_threads
- Use smaller/quantized model
- Lower max_context_length

## Advanced Topics

### Running Multiple Workers

You can run multiple worker instances on the same machine:

```bash
# Terminal 1
CUDA_VISIBLE_DEVICES=0 python start_worker.py -n "Worker-GPU0"

# Terminal 2
CUDA_VISIBLE_DEVICES=1 python start_worker.py -n "Worker-GPU1"
```

### Docker Deployment

Coming soon: Docker images for easy deployment

### Cloud Deployment

Text workers can run on cloud GPUs:
- AWS EC2 (g4dn, p3, p4 instances)
- Google Cloud (T4, V100, A100)
- Azure (NC series)
- RunPod, Vast.ai, Lambda Labs

## Conclusion

Running a text worker is a great way to monetize your GPU while contributing to decentralized AI infrastructure. Whether you're using the flexible Text Worker Bridge or the user-friendly OmniForge, you'll be earning AIPG tokens and helping democratize access to AI.

**Get Started**:
- Text Worker Bridge: https://github.com/AIPowerGrid/text-worker-bridge
- OmniForge: https://github.com/AIPowerGrid/omniforge
- Discord Support: https://discord.gg/aipowergrid
- Main Website: https://aipowergrid.io

Happy earning! 🚀

