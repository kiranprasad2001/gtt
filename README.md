# GTA (GTA Transit Tracker)

An blazing-fast, unified transit tracking application for the Greater Toronto Area. GTA provides real-time vehicle positions, subway ETAs, and multi-agency support, all wrapped in a sleek, responsive map interface.

## Features

1. **Live Map Tracking**: Real-time vehicle positions for the TTC with >1,000 active bounds tracked seamlessly on an interactive map.
2. **Multi-Agency Support**: Track stops and schedules across multiple agencies including TTC, GO Transit, MiWay, Brampton Transit, and YRT.
3. **Subway ETAs**: Direct integration fetching live countdowns for the TTC subway network.
4. **Legacy App Integration**: Includes a fully-functional legacy tracker bundled inside (originally `ttc.kiranic.com`) to preserve classic transit message tracking.
5. **Route Paths & Accessibility**: Interactive polylines, accessibility station warnings, and vehicle clustering.

## Credits & Inspiration

This application is heavily inspired by and forks concepts from several excellent community transit trackers:
- [tobus.ca](https://tobus.ca/)
- [livebus.ca](https://livebus.ca/)
- [ttcmap.ca](https://ttcmap.ca/)

## Prerequisites

- `npm`
- `docker` (optional)

## Getting Started

Run the app locally:

```Shell
npm install
npm run dev
```

Build for production (Cloudflare Pages compatible):

```Shell
npm run build
npx wrangler deploy
```

## Contributing

If you are not familiar with coding, spread the word! I'd love it to be helpful to more people. If you got some idea, make an issue about it.

If you know some coding, welcome! Please consider using the latest packages and writing standard to keep debt to a minimum. Small cosmetic improvements and translations are also very welcome.
