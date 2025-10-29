const CHANNEL_URLS: Record<string, string> = {
  'F-TAC-201': 'https://www.broadcastify.com/calls/tg/2/1371',
  'F-TAC-202': 'https://www.broadcastify.com/calls/tg/2/1372',
  'F-TAC-203': 'https://www.broadcastify.com/calls/tg/2/1373',
  'F-TAC-204': 'https://www.broadcastify.com/calls/tg/2/1374',
  'F-TAC-205': 'https://www.broadcastify.com/calls/tg/2/1375',
  'F-TAC-206': 'https://www.broadcastify.com/calls/tg/2/1376',
  'F-TAC-207': 'https://www.broadcastify.com/calls/tg/2/1377',
  'Firecom North': 'https://www.broadcastify.com/calls/tg/2/1121',
  'Firecom South': 'https://www.broadcastify.com/calls/tg/2/1123',
};

export function getChannelUrl(channelName: string): string | null {
  return CHANNEL_URLS[channelName] || null;
}

export function isChannelLinkable(channelName: string): boolean {
  return channelName in CHANNEL_URLS;
}
