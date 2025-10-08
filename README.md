# Austin Fire & Incident Map 🚒

Real-time emergency incident monitoring and visualization for Austin and Travis County, Texas. This application combines public incident data with live radio dispatch audio to provide comprehensive situational awareness for fire, medical, and traffic incidents.

## ✨ Features

### Core Functionality
- **Real-time Incident Tracking** - Live updates from Austin Open Data Portal and Broadcastify radio calls
- **Interactive Map** - MapLibre GL-powered map with incident markers, clustering, and user location tracking
- **Live Dispatch Audio** - Integration with Broadcastify Calls API for live radio communications
- **AI-Powered Transcript Processing** - Deepgram transcribes audio, GPT-4o-mini extracts structured data (addresses, units, call types)
- **Smart Geocoding** - Intelligent address parsing with multiple fallback providers to handle transcription errors
- **Concurrent Processing** - Parallel batch transcription (20 requests at once) for ultra-fast incident loading

### User Experience
- **Split-Panel Interface** - Resizable sidebar with incident list and full-screen map view
- **Advanced Filtering** - Filter by status, date range, agency, and search terms
- **Dark/Light Theme** - Automatic theme detection with manual toggle
- **Audio Playback** - Built-in player for dispatch call recordings
- **Incident Banners** - Animated notifications for new incidents
- **Incident Replay** - Re-inject past incidents to review and test alerts

### Data Intelligence
- **Resolution Time Estimation** - AI-powered predictions for incident resolution based on type and severity
- **Unit Tracking** - Automatic extraction of responding units (Engine 5, Medic 12, etc.)
- **Channel Identification** - Parse radio channels and tactical frequencies
- **Address Normalization** - Handle common OCR/transcription errors in dispatch audio
- **Priority Sorting** - High-priority incidents processed first for faster display

## 🏗️ Tech Stack

**Frontend**
- [Next.js 15](https://nextjs.org/) - React framework with App Router
- [React 19](https://react.dev/) - UI library
- [TypeScript 5](https://www.typescriptlang.org/) - Type safety
- [Tailwind CSS 4](https://tailwindcss.com/) - Utility-first styling
- [shadcn/ui](https://ui.shadcn.com/) - Component library
- [MapLibre GL](https://maplibre.org/) - Interactive maps
- [Turbopack](https://turbo.build/pack) - Fast bundler

**Backend**
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers) - Serverless functions
- [Server-Sent Events (SSE)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) - Real-time streaming
- [Deepgram API](https://deepgram.com/) - Speech-to-text transcription (Nova-2 model)
- [OpenAI API](https://platform.openai.com/) - GPT-4o-mini for transcript parsing
- [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) - JWT authentication for Broadcastify

**Data Sources**
- [Austin Open Data Portal](https://data.austintexas.gov/) - Fire/rescue/traffic incidents
- [Broadcastify Calls API](https://api.bcfy.io/) - Live radio dispatch audio
- [Nominatim](https://nominatim.org/) - Primary geocoding service
- [Maps.co](https://maps.co/) - Fallback geocoding with dual-key support

## 📋 Prerequisites

- **Node.js** 20+ and **pnpm** 9+
- **Broadcastify API credentials** (API Key ID, Secret, App ID)
- **Deepgram API key** (free tier: 45,000 minutes/month)
- **OpenAI API key** (for GPT-4o-mini transcript parsing)
- **Broadcastify account** (username/password for authenticated API access)

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/austin-fire-map.git
cd austin-fire-map
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Configure Environment Variables

Create a `.env.local` file in the project root:

```env
# Broadcastify API Credentials
# Obtain from: https://www.broadcastify.com/developer
BROADCASTIFY_API_KEY_ID=your_api_key_id
BROADCASTIFY_API_KEY_SECRET=your_api_key_secret
BROADCASTIFY_APP_ID=your_app_id

# Deepgram API Key (Free tier available)
# Obtain from: https://console.deepgram.com/
DEEPGRAM_API_KEY=your_deepgram_api_key

# OpenAI API Key (for transcript parsing)
# Obtain from: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-your-openai-api-key

# Optional: Geocoding API Keys (for fallback geocoding)
GEOCODING_API_KEY=your_mapsco_api_key
GEOCODING_API_KEY_2=your_mapsco_api_key_2
```

### 4. Run Development Server

```bash
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## 📦 Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm run dev` | Start development server with Turbopack hot reload |
| `pnpm run build` | Create production build |
| `pnpm run start` | Start production server (requires build first) |
| `pnpm run lint` | Run ESLint code quality checks |

## 🎯 Usage

### Monitoring Live Incidents

1. **View Map** - Incidents appear as colored markers (red=fire, blue=medical, yellow=traffic)
2. **Filter Incidents** - Use sidebar filters for status, date range, or search
3. **Click Marker** - View detailed incident information
4. **Play Audio** - Click audio button to hear dispatch call recording
5. **Track Location** - Enable location tracking to see your position

### Settings Configuration

Click the settings icon to configure:
- **Data Source** - Toggle between Austin Open Data and Broadcastify Calls
- **Auto-refresh Interval** - Set polling frequency (15s to 5min)
- **Show Banner** - Enable/disable new incident notifications
- **Active Groups** - Select which radio channels to monitor

### Incident Replay

For testing or review:
1. Open incident details in sidebar
2. Click "Replay" button
3. Incident will be re-injected as new with banner animation

## 🏛️ Architecture

### Data Flow

```
┌─────────────────┐
│ Broadcastify    │
│ Calls API       │
└────────┬────────┘
         │
         ├─► JWT Authentication
         │
         ├─► Fetch Live Radio Calls (MP3 URLs)
         │
         ▼
┌─────────────────┐
│ Deepgram API    │
│ (Transcription) │
└────────┬────────┘
         │
         ├─► Parallel Batch Processing (20 concurrent)
         │   ├─ Nova-2 model
         │   └─ Smart formatting
         │
         ▼
┌─────────────────┐
│ OpenAI API      │
│ (GPT-4o-mini)   │
└────────┬────────┘
         │
         ├─► Extract structured data:
         │   ├─ Call type
         │   ├─ Units
         │   ├─ Addresses
         │   ├─ Channels
         │   └─ Address variants
         │
         ▼
┌─────────────────┐
│ Geocoding       │
│ (Multi-source)  │
└────────┬────────┘
         │
         ├─► Nominatim (primary)
         ├─► Maps.co (fallback)
         │
         ├─► Stream via SSE
         │
         ▼
┌─────────────────┐
│ Client State    │
│ (React Hooks)   │
└────────┬────────┘
         │
         ├─► Filter & Search
         │
         ├─► Update Map Markers
         │
         └─► Display Banners
```

### Project Structure

```
austin-fire-map/
├── src/
│   ├── app/
│   │   ├── page.tsx                      # Main application page
│   │   ├── layout.tsx                    # Root layout with theme provider
│   │   └── api/
│   │       └── broadcastify/
│   │           └── live-calls/
│   │               └── route.ts          # SSE endpoint with parallel processing
│   ├── components/
│   │   ├── IncidentMap.tsx               # MapLibre GL map component
│   │   ├── IncidentsList.tsx             # Sidebar with filtering
│   │   ├── CallBanner.tsx                # New incident notifications
│   │   ├── SettingsDialog.tsx            # Configuration UI
│   │   ├── LoadingScreen.tsx             # Initial load animation
│   │   ├── ThemeToggle.tsx               # Dark/light mode switcher
│   │   └── ui/                           # shadcn/ui components
│   ├── lib/
│   │   ├── api.ts                        # useFireIncidents hook
│   │   ├── dispatch-parser.ts            # GPT-4o-mini parsing logic
│   │   ├── broadcastify-jwt.ts           # JWT token generation
│   │   ├── settings.ts                   # Settings persistence
│   │   └── utils.ts                      # Utility functions
│   └── types/
│       ├── incident.ts                   # Incident data types
│       └── broadcastify.ts               # API response types
├── public/                               # Static assets
├── .env.local                            # Environment variables (create this)
├── package.json                          # Dependencies
├── tsconfig.json                         # TypeScript configuration
└── tailwind.config.js                    # Tailwind CSS configuration
```

## 🔧 Configuration

### Broadcastify Group IDs

Austin/Travis County radio channels (configured in settings):
- **Fire Dispatch A1**: `2-3416`
- **Fire Dispatch A2**: `2-3417`
- **Fire Dispatch A3**: `2-3418`
- **Medical Dispatch M1**: `2-3419`
- **Medical Dispatch M2**: `2-3420`

### Transcription Processing

The application uses a two-stage AI pipeline:

1. **Deepgram Nova-2** - Converts MP3 audio to text
   - Real-time speed (~10x faster than Whisper)
   - Smart formatting and punctuation
   - Processes directly from URL (no download needed)
   - Batch processing: 20 concurrent requests

2. **OpenAI GPT-4o-mini** - Extracts structured data from transcript
   - Call types with proper title case
   - Unit identification (Engine 5, Medic 12)
   - Address parsing with error correction
   - Channel extraction (F-TAC-203)
   - Address variant generation for geocoding

### Geocoding Strategy

Multi-provider fallback with rate limiting:
1. **Nominatim** - Primary free service (1 req/sec)
2. **Maps.co Key 1** - First fallback (1 req/sec)
3. **Maps.co Key 2** - Second fallback (1 req/sec)

Each provider tries all address variants before moving to next provider.

### Rate Limiting

- **Broadcastify API**: Maximum 1 request per 5 seconds (enforced by API)
- **Deepgram API**: 100 concurrent requests (using batch size of 20)
- **Client Polling**: Configurable interval (default 30 seconds)
- **OpenAI API**: Standard quota limits
- **Nominatim**: 1 request per second (enforced by client)

## 🛠️ Development

### Adding New Features

See `CLAUDE.md` for detailed development patterns including:
- Adding new incident fields
- Modifying dispatch parsing logic
- Changing map behavior
- Extending filter capabilities

### Testing Broadcastify Integration

Use test credentials provided in Broadcastify API docs:
```bash
# Standard User
Username: spook42069
Password: df7a0nqagl

# Premium Subscriber
Username: motion42069
Password: ef7a0n5a5ml
```

Test JWT generation:
```bash
pnpm tsx src/lib/test-jwt.ts
```

### Common Development Tasks

**Debug SSE Connection:**
```bash
# Terminal 1: Start dev server with logging
pnpm run dev

# Terminal 2: Monitor SSE endpoint
curl -N http://localhost:3000/api/broadcastify/live-calls?stream=1&init=1
```

**Test Geocoding:**
```javascript
// In browser console
fetch('/api/geocode?address=100 Main St, Austin, TX')
  .then(r => r.json())
  .then(console.log)
```

**Clear Local Storage:**
```javascript
// In browser console
localStorage.clear()
location.reload()
```

## 🚢 Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Import project in [Vercel Dashboard](https://vercel.com)
3. Add environment variables in project settings
4. Deploy

### Environment Variables for Production

Ensure all required environment variables are set:
- Broadcastify credentials (3 variables)
- Deepgram API key
- OpenAI API key
- Optional: Maps.co geocoding keys

### Performance Considerations

- **SSE Connections**: Browser limit of 6 concurrent EventSource connections
- **Map Tiles**: Consider MapTiler or Mapbox for production tile serving
- **Geocoding**: Multi-provider fallback reduces dependency on single service
- **Transcription**: Deepgram free tier provides 45k minutes/month
- **Parsing**: OpenAI GPT-4o-mini costs ~$0.0001 per call
- **Batch Processing**: 20 concurrent requests = 10-15x faster initial loads

## 💰 Cost Estimates

For typical usage (monitoring 1-2 channels):
- **Deepgram**: FREE (45k min/month tier covers ~1500 incidents/day)
- **OpenAI**: ~$3-5/month (GPT-4o-mini parsing)
- **Nominatim**: FREE (community service)
- **Maps.co**: FREE tier or $10/month for higher limits
- **Vercel**: FREE (Hobby tier sufficient)

**Total**: $0-15/month depending on traffic and geocoding needs

## 📝 License

MIT License - See `LICENSE` file for details

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📧 Support

For issues and questions:
- Open an issue on GitHub
- Check `CLAUDE.md` for architecture details
- Review Broadcastify API documentation

## 🙏 Acknowledgments

- **City of Austin** - Open Data Portal
- **Broadcastify/RadioReference** - Live radio call data
- **Deepgram** - Fast, accurate speech-to-text transcription
- **OpenAI** - GPT-4o-mini for intelligent transcript parsing
- **Austin Fire Department** - Emergency response data

---

Built with ❤️ for Austin/Travis County emergency services
