# Austin Incident Map

Real-time fire, rescue, hazmat, and traffic incidents map for Austin and Travis County, Texas.

## Tech Stack

- **Framework**: Next.js 15.5.3 with React 19.1.0
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4
- **UI Components**: Radix UI primitives
- **Maps**: MapLibre GL
- **State Management**: React hooks (useState, useEffect)
- **Data Source**: Austin Open Data Portal
- **Notifications**: Sonner
- **Development**: Turbopack

## Features

- Real-time incident visualization on interactive map
- Split-panel layout with resizable incident list and map
- Dark/light theme toggle
- Location tracking with user position marker
- Incident filtering and search
- Auto-refresh every minute
- Manual refresh capability
- Toast notifications for updates

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Run the development server:
   ```bash
   pnpm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000)

## Data Sources

- Fire/Rescue/Hazmat: [Austin Fire Incidents](https://data.austintexas.gov/resource/wpu4-x69d.json)
- Traffic Incidents: [Austin Traffic Reports](https://data.austintexas.gov/resource/dx9v-zd7x.json)

## Scripts

- `pnpm run dev` - Start development server with Turbopack
- `pnpm run build` - Build for production with Turbopack
- `pnpm run start` - Start production server
- `pnpm run lint` - Run ESLint

## Project Structure

```
src/
├── app/
│   └── page.tsx          # Main application page
├── components/
│   ├── IncidentMap.tsx   # MapLibre-based incident map
│   ├── IncidentsList.tsx # Filterable incidents sidebar
│   └── ThemeToggle.tsx   # Dark/light theme switcher
├── lib/
│   └── api.ts           # Data fetching and hooks
└── types/
    └── incident.ts      # TypeScript type definitions
```
