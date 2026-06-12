import './auth';
import './webhooks';
import './overlay-trigger-values';
import { RegenerateConfig } from './config';
import { PLATFORM } from './constants';
import { registerKickOverlayTriggers } from './triggers';

void dashboard.registerPlatform({
  id: PLATFORM,
  name: {
    en: 'Kick',
    ru: 'Kick',
    uk: 'Kick',
  },
});

void registerKickOverlayTriggers();

status.OnClick(() => {
  api.restart();
});

RegenerateConfig();
