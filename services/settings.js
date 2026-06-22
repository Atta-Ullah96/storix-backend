import SystemSettings from '../models/systemSettings.js';

export const getSystemSettings = async () =>
  SystemSettings.findOneAndUpdate(
    { key: 'global' },
    { $setOnInsert: { key: 'global' } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
