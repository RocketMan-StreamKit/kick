/** Overlay trigger options exposed in overlay settings UI. */
export const registerKickOverlayTriggers = () => {
  return dashboard.registerTriggers([
    {
      type: 'follow',
      label: {
        en: 'New follower',
        ru: 'Новый фолловер',
        uk: 'Новий фоловер',
      },
    },
    {
      type: 'subscribe',
      label: {
        en: 'Subscription',
        ru: 'Подписка',
        uk: 'Підписка',
      },
    },
    {
      type: 'subgift',
      label: {
        en: 'Sub gift',
        ru: 'Сабгифт',
        uk: 'Сабгифт',
      },
      valueType: 'number',
      valueMatch: 'minimum',
      valueHint: {
        en: 'Minimum subs gifted at once',
        ru: 'Минимум подаренных сабов за раз',
        uk: 'Мінімум подарованих сабів за раз',
      },
    },
    {
      type: 'custom',
      key: 'kicks',
      label: {
        en: 'KICKs gift',
        ru: 'Подарок KICKs',
        uk: 'Подарунок KICKs',
      },
      valueType: 'number',
      valueMatch: 'minimum',
      valueHint: {
        en: 'Minimum KICKs amount',
        ru: 'Минимальная сумма KICKs',
        uk: 'Мінімальна сума KICKs',
      },
    },
    {
      type: 'custom',
      key: 'redeems',
      label: {
        en: 'Channel point reward',
        ru: 'Награда за баллы канала',
        uk: 'Нагорода за бали каналу',
      },
      valueType: 'dynamic',
      valueProvider: 'kick_rewards',
      valueGenerateLabel: {
        en: 'Generate reward',
        ru: 'Сгенерировать награду',
        uk: 'Згенерувати нагороду',
      },
      requireValue: {
        key: 'cost',
        type: 'number',
        label: {
          en: 'Reward cost',
          ru: 'Стоимость награды',
          uk: 'Вартість нагороди',
        },
        default: 100,
        min: 1,
      },
    },
    {
      type: 'custom',
      key: 'live',
      label: {
        en: 'Stream went live',
        ru: 'Стрим начался',
        uk: 'Стрім почався',
      },
      valueType: 'number',
      valueHint: {
        en: 'Use 1 to match stream start',
        ru: 'Укажите 1 для старта стрима',
        uk: 'Вкажіть 1 для старту стріму',
      },
    },
  ]);
};
