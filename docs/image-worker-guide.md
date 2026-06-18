# AIPG Image Worker Guide

## Overview

Image workers run Stable Diffusion and other image generation models, earning AIPG tokens by creating AI-generated images for users on the AIPG network. This guide covers everything you need to become an image worker and start earning.

## What is an Image Worker?

An image worker is a node in the AIPG distributed AI network that:
- Runs Stable Diffusion models (SD 1.5, SDXL, etc.)
- Generates images from text prompts
- Earns AIPG tokens for completed generations
- Contributes to decentralized AI art infrastructure

## Hardware Requirements

### Minimum Specifications
- **GPU**: NVIDIA GTX 1660 (6GB VRAM)
- **RAM**: 16GB system RAM
- **Storage**: 100GB free space (for models)
- **Internet**: 5 Mbps upload speed
- **OS**: Windows or Linux

### Recommended Specifications
- **GPU**: NVIDIA RTX 3060 (12GB VRAM) or better
- **RAM**: 32GB system RAM
- **Storage**: 500GB SSD
- **Internet**: 10+ Mbps upload speed
- **OS**: Windows 10/11 or Linux

### Optimal Setup
- **GPU**: NVIDIA RTX 4090 (24GB VRAM)
- **RAM**: 64GB+ system RAM
- **Storage**: 1TB+ NVMe SSD
- **Internet**: 50+ Mbps upload speed
- **Uptime**: 95%+ availability

## Current Image Worker Software

### AIPG Image Worker

**GitHub**: https://github.com/AIPowerGrid/image-worker

The current image worker is a fork of the Horde Worker reGen, specifically configured for the AIPG network. It supports a wide range of Stable Diffusion models and features.

#### Features
- Stable Diffusion 1.5, 2.1, and SDXL support
- LoRA and ControlNet support
- Multiple models simultaneously
- Automatic model downloading
- Post-processing capabilities
- Upscaling and face restoration

#### Supported Models

**Base Models**
- Stable Diffusion 1.5
- Stable Diffusion 2.1 (768px and 512px)
- Stable Diffusion XL (SDXL)
- Stable Cascade
- Flux (all variants supported)
  - Flux.1 Schnell
  - Flux.1 Dev
  - Flux Krea
  - Flux Chroma

**Custom Models**
- Thousands of community checkpoints
- LoRA models for style control
- ControlNet for composition
- Embeddings and textual inversions

#### Installation (Windows)

**Option 1: Using Git (Recommended)**

1. Install Git for Windows if you haven't already
2. Open PowerShell or Command Prompt
3. Navigate to installation folder:
```cmd
cd C:\path\to\install\folder
```

4. Clone the repository:
```cmd
git clone https://github.com/AIPowerGrid/image-worker
cd image-worker
```

**Option 2: Without Git**

1. Download the zipped worker files from GitHub
2. Extract to a folder of your choice

#### Installation (Linux)

```bash
git clone https://github.com/AIPowerGrid/image-worker
cd image-worker
```

#### Configuration

1. **Copy Template Configuration**
```bash
cp bridgeData_template.yaml bridgeData.yaml
```

2. **Edit Configuration**

Open `bridgeData.yaml` and configure:

```yaml
# Your unique worker name (must be unique across entire network)
dreamer_name: "MyImageWorker"

# Your AIPG API key
api_key: "your-api-key-here"

# GPU settings
max_threads: 1  # Increase for powerful GPUs
queue_size: 1   # 0 for <32GB RAM, 1 for 32GB+, 2+ for 64GB+

# Model settings
models_to_load:
  - "stable_diffusion"
  - "stable_diffusion_2.1"
  # Add SDXL only if you have 12GB+ VRAM
  # - "stable_diffusion_xl"

# Performance settings
max_power: 32  # Lower for weaker GPUs (8-16)
extra_slow_worker: false  # Set true if <0.3 MPS/S

# Features
allow_controlnet: true
allow_lora: true
allow_post_processing: true
allow_sdxl_controlnet: false  # Requires 12GB+ VRAM
```

3. **Important Settings by Hardware**

**Lower-End GPUs (6-8GB VRAM)**
```yaml
max_power: 8
max_threads: 1
queue_size: 0
extra_slow_worker: true
limit_max_steps: true
models_to_load:
  - "stable_diffusion"  # SD 1.5 only
models_to_skip:
  - "ALL SDXL"
  - "ALL SD21"
load_large_models: false
```

**Mid-Range GPUs (12-16GB VRAM)**
```yaml
max_power: 32
max_threads: 1
queue_size: 1
models_to_load:
  - "stable_diffusion"
  - "stable_diffusion_2.1"
  - "stable_diffusion_xl"
```

**High-End GPUs (24GB+ VRAM)**
```yaml
max_power: 64
max_threads: 2
queue_size: 2
allow_sdxl_controlnet: true
# Can run all models including Flux
```

#### Running the Worker

**Windows**
```cmd
horde-bridge.cmd
```

**Linux**
```bash
./horde-bridge.sh
```

**AMD GPUs (Linux Only - Experimental)**
```bash
./horde-bridge-rocm.sh
```

**DirectML (Windows - Experimental, Very Slow)**
```cmd
horde-bridge-directml.cmd
```

#### Stopping the Worker

- Press `Ctrl+C` in the terminal
- Worker will finish current jobs before exiting
- Don't force quit - let it exit gracefully

### System Requirements Notes

**Storage**
- Use SSD (strongly recommended)
- HDDs should only offer one model
- Models can be 2-7GB each
- SDXL models are larger (~6GB)

**RAM**
- Configure 8GB+ swap space (16GB+ recommended)
- SDXL needs ~9GB free RAM (32GB+ total recommended)
- Flux and Stable Cascade need ~20GB free RAM (48GB+ total)
- RAM usage scales with `queue_size`

**Power Management**
- Disable sleep/hibernation while worker runs
- Disable GPU power saving
- Keep system cool and well-ventilated

## Earnings and Economics

### Payment Model

**How You Earn**
- Pay-per-image generation
- Instant payment upon completion
- Rates based on:
  - Image resolution
  - Number of steps
  - Model complexity (SDXL pays more than SD 1.5)
  - Post-processing (upscaling, face fix)
  - ControlNet usage

### Earnings

Earnings vary significantly based on:
- Network demand
- Your GPU performance
- Uptime and availability
- Model types you serve
- Image resolution and complexity
- Post-processing features enabled

Contact the community on Discord for real worker earnings data and experiences.

### Kudos System

**New Workers**
- 50% of job rewards held in escrow initially
- 100% of uptime kudos held in escrow
- After ~1 week of uptime, become "trusted"
- Receive all escrowed kudos
- Earn full rewards immediately going forward

**Maintenance Mode**
- Workers automatically paused if failing jobs
- Check logs for "ERROR" messages
- Fix issues before unpausing
- Unpause at: https://artbot.aipowergrid.io (manage workers page)

## Monitoring and Maintenance

### Checking Status

**Terminal Output**
- Watch for completed jobs
- Monitor kudos earned
- Check for errors and warnings

**Log Files**
Located in `logs/` directory:
- `bridge.log`: Main worker log
- `bridge_n.log`: Process-specific logs
- `trace.log`: Errors and warnings only
- `trace_n.log`: Process-specific errors

### Performance Metrics

**Target Performance**
- **MPS/S**: Megapixels per second
  - Good: >0.5 MPS/S
  - Acceptable: 0.3-0.5 MPS/S
  - Slow: <0.3 MPS/S (enable `extra_slow_worker`)
- **Kudos/Hour**: >3000 for efficient operation

### Common Issues

**Download Failures**
- Check disk space
- Verify internet connection
- Retry download

**Job Timeouts**
- Remove large models (Flux, Cascade, SDXL)
- Lower `max_power`
- Disable `allow_post_processing`
- Disable `allow_controlnet`
- Disable `allow_sdxl_controlnet`

**Out of Memory**
- Decrease `max_threads`
- Decrease `queue_size`
- Remove SDXL models
- Close other applications
- Add more system RAM/swap

**Wrong Credentials Error**
- Worker name already taken
- Choose a unique `dreamer_name`
- Must be unique across entire AIPG network

## Updating the Worker

### Update Frequency

The worker is constantly improving. Check Discord for update notifications.

### Update Process

1. **Stop the Worker**
```
Ctrl+C
```

2. **Update Files**

If using Git:
```bash
git pull
```

If using zip download:
- Delete old `horde_worker_regen` folder
- Download latest zip
- Extract to original location

3. **Update Runtime**

Windows:
```cmd
update-runtime.cmd
```

Linux:
```bash
./update-runtime.sh
```

AMD:
```bash
./update-runtime-rocm.sh
```

4. **Restart Worker**

Run the appropriate `horde-bridge` script for your system.

### Antivirus Issues

Some antivirus software (e.g., Avast) may interfere with updates:
- If you get `CRYPT_E_NO_REVOCATION_CHECK` errors
- Temporarily disable antivirus
- Run update
- Re-enable antivirus

## Custom Models

### Requirements

To serve custom models not in the reference:
1. Request `customizer` role on Discord
2. Download model files locally
3. Configure in `bridgeData.yaml`

### Configuration

```yaml
custom_models:
  - name: My Custom Model
    baseline: stable_diffusion_xl
    filepath: /path/to/model/file.safetensors
```

**Supported Baselines**
- `stable_diffusion_1`
- `stable_diffusion_2_768`
- `stable_diffusion_2_512`
- `stable_diffusion_xl`
- `stable_cascade`
- `flux_1` (all Flux variants supported)

### Important Notes

- Custom model names can't match existing model names
- Don't use sexually explicit or vulgar names
- `custom_models.json` will appear on startup
- Horde treats custom models as SD 1.5 for kudos/safety

## Multiple GPUs

### Current Limitation

Future versions won't need multiple worker instances, but for now:
- Start a separate worker per GPU
- Each needs its own directory and configuration

### Linux Multi-GPU Setup

```bash
# GPU 0
CUDA_VISIBLE_DEVICES=0 ./horde-bridge.sh -n "Worker-GPU0"

# GPU 1 (in separate terminal)
CUDA_VISIBLE_DEVICES=1 ./horde-bridge.sh -n "Worker-GPU1"
```

### RAM Requirements

**Warning**: Multiple workers need significant RAM:
- 32-64GB+ system RAM recommended
- `queue_size` and `max_threads` multiply RAM usage
- Monitor system resources carefully

## Docker Deployment

### Docker Images

Available at: https://hub.docker.com/r/tazlin/horde-worker-regen/tags

### Documentation

See `Dockerfiles/README.md` in the repository for detailed Docker setup instructions.

## Advanced Features

### ControlNet

Allows precise control over image composition:
- Requires additional VRAM
- Enable with `allow_controlnet: true`
- SDXL ControlNet needs 12GB+ VRAM

### LoRA Models

Style and character control:
- Enable with `allow_lora: true`
- Minimal VRAM overhead
- Thousands of community LoRAs available

### Post-Processing

Image enhancement:
- Upscaling (RealESRGAN)
- Face restoration (CodeFormer, GFPGAN)
- Enable with `allow_post_processing: true`
- Adds processing time but increases kudos

## Future: Easier Image Worker (Coming Soon)

An easier-to-use image worker is currently in development, featuring:
- Simplified installation
- User-friendly configuration
- Web-based management UI
- Automatic optimization
- One-click setup

Stay tuned on Discord for announcements!

## Video Generation (Experimental)

### Current Status

Video generation is actively being worked on for the AIPG network.

### Hardware Requirements

**Minimum for Good Results**
- NVIDIA RTX 5090 (upcoming)
- NVIDIA Blackwell series (upcoming)
- NVIDIA H100
- NVIDIA B100
- Other enterprise/data center GPUs

**Why Such High Requirements?**
- Video generation is extremely VRAM-intensive
- Requires 40GB+ VRAM for quality results
- Temporal consistency needs large models
- Multiple frames processed simultaneously

### Timeline

- Experimental support: Q1 2026
- Production-ready: Q2 2026
- Consumer GPU support: TBD (depends on hardware evolution)

### Supported Models (Planned)

- Stable Video Diffusion
- AnimateDiff
- Custom video models
- Frame interpolation
- Video upscaling

**Note**: Video generation will be a separate worker type with its own setup guide when released.

## Best Practices

### Optimization

**System Level**
- Use SSD for model storage
- Adequate cooling for GPU
- Disable power saving
- Close unnecessary applications

**Worker Configuration**
- Start conservative, increase gradually
- Monitor performance metrics
- Balance speed vs reliability
- Test after configuration changes

### Reliability

- Maintain 80%+ uptime
- Monitor logs regularly
- Update worker software
- Keep GPU drivers current
- Backup configuration files

### Security

- Never share your API key
- Use unique worker names
- Keep system updated
- Monitor for unusual activity

## Troubleshooting

### Getting Help

**Discord Channels**
- `#local-workers`: General worker discussion
- `#image-workers`: Image-specific help
- `#support`: Technical support

**GitHub Issues**
- Report bugs: https://github.com/AIPowerGrid/image-worker/issues
- Feature requests welcome

**Resources**
- Worker documentation in repo
- Community guides on Discord
- Video tutorials (coming soon)

### Common Error Messages

**"Wrong Credentials"**
- Worker name already taken
- Choose a different `dreamer_name`

**"Model Download Failed"**
- Check disk space
- Verify internet connection
- Check firewall settings

**"CUDA Out of Memory"**
- Model too large for GPU
- Reduce `max_threads` or `queue_size`
- Remove SDXL/large models
- Lower `max_power`

**"Worker in Maintenance Mode"**
- Check logs for errors
- Fix underlying issues
- Unpause at artbot.aipowergrid.io

## Model Licenses

Many bundled models use the **CreativeML OpenRAIL License**. Please review before use.

## Conclusion

Running an image worker is an excellent way to monetize your GPU while contributing to decentralized AI art infrastructure. With the current worker software, you can start earning AIPG tokens today, and an even easier version is coming soon!

**Get Started**:
- Image Worker: https://github.com/AIPowerGrid/image-worker
- Discord Support: https://discord.gg/aipowergrid
- Art Gallery: https://aipg.art (coming soon)
- Main Website: https://aipowergrid.io

Happy generating! 🎨

