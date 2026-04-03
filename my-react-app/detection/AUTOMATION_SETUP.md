# Near-Crash Detector Automation Setup

## Overview

This guide shows how to automate `near_crash_detector.py` on a Raspberry Pi or Linux server using systemd.

## Architecture

- **Public cameras server**: Runs detection for public camera streams (continuous)
- **Each RPi**: Runs detection for its local camera feed (continuous on boot)
- **Detection Service (backend)**: Receives events via POST /api/events from all detectors
- **Frontend**: Displays aggregated hotspots in real-time

## Prerequisites

```bash
# On RPi/server
sudo apt update
sudo apt install -y python3-pip git
pip3 install ultralytics opencv-python numpy requests

# Install torch (RPi-specific, might take a while)
pip3 uninstall torch torchvision -y
pip3 install torch torchvision --index-url https://download.pytorch.org/whl/cpu
```

## Setup on RPi/Linux Server

### 1. Copy the detection code to RPi

```bash
scp -r ~/my-react-app/detection pi@raspberrypi.local:/home/pi/
cd /home/pi/detection
```

### 2. Install the systemd service

```bash
# Copy service file
sudo cp near-crash-detector.service /etc/systemd/system/

# Edit service file to match your setup
sudo nano /etc/systemd/system/near-crash-detector.service

# Key fields to customize:
# - WorkingDirectory (path to detection folder)
# - ExecStart (source, location, API URL)
# - User (username running the service)
```

### 3. Configure the service

Edit `/etc/systemd/system/near-crash-detector.service`:

**For local RPi camera (index 0):**

```ini
ExecStart=/usr/bin/python3 near_crash_detector.py \
  --source 0 \
  --location "CAM_RPi_01|42.6977,23.3219" \
  --no-show \
  --log-file /var/log/near-crash-detector.ndjson
```

**For multiple sources on one server:**

```ini
ExecStart=/usr/bin/python3 near_crash_detector.py \
  --source rtsp://public-cam1.com/stream \
  --location "CAM_Public_01|42.69,23.32" \
  --source rtsp://public-cam2.com/stream \
  --location "CAM_Public_02|42.70,23.33" \
  --no-show
```

### 4. Enable and start the service

```bash
# Reload systemd config
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable near-crash-detector.service

# Start the service now
sudo systemctl start near-crash-detector.service

# Check status
sudo systemctl status near-crash-detector.service

# View logs
sudo journalctl -u near-crash-detector.service -f
```

## Environment Variables

If you need to override the Detection Service API URL:

Edit the service file to add Environment variables:

```ini
[Service]
Environment="DETECTION_API_URL=http://your-server:8005"
```

Then modify publisher.py to read from env:

```python
api_url = os.getenv("DETECTION_API_URL", "http://localhost:8005")
```

## Deployment Examples

### Example 1: RPi with local camera

```ini
ExecStart=/usr/bin/python3 near_crash_detector.py \
  --source 0 \
  --location "CAM_RPi_Kitchen|42.6977,23.3219" \
  --no-show
```

### Example 2: Laptop with 2 public streams

```ini
ExecStart=/usr/bin/python3 near_crash_detector.py \
  --source rtsp://sofia-cam-1.public.org/feed \
  --location "CAM_Sofia_Downtown|42.6977,23.3219" \
  --source rtsp://sofia-cam-2.public.org/feed \
  --location "CAM_Sofia_Airport|42.6934,23.3189" \
  --no-show
```

### Example 3: RPi with recorded demo video (fallback strategy)

For the demo: if video ends, manually switch to a stream:

```bash
# Option A: Just play the video
python3 near_crash_detector.py \
  --source demo.mp4 \
  --location "CAM_Demo|42.6977,23.3219" \
  --no-show

# Option B: If you want automatic demo loop (requires wrapper script)
```

## Troubleshooting

**Service fails to start:**

```bash
sudo journalctl -u near-crash-detector.service -n 50
```

**Permission denied on socket/log:**

```bash
sudo chown -R pi:pi /home/pi/detection
sudo chmod -R 755 /home/pi/detection
```

**Camera not detected (source 0 fails):**

```bash
# Test camera directly
python3 -c "import cv2; cap = cv2.VideoCapture(0); print(cap.isOpened())"
```

**API connection refused:**

- Check Detection Service is running: `curl http://localhost:8005/health`
- Check firewall: `sudo ufw allow 8005`

## Stopping/Restarting

```bash
# Stop
sudo systemctl stop near-crash-detector.service

# Restart
sudo systemctl restart near-crash-detector.service

# Disable on boot
sudo systemctl disable near-crash-detector.service
```

## Next Steps

1. Deploy service on your laptop first (test with public streams)
2. Deploy service on each RPi (test with local cameras)
3. Verify events appear in frontend hotspots
4. Monitor logs: `sudo journalctl -u near-crash-detector.service -f`
