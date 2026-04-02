import { useState, useEffect, useRef } from "react";
import { getDb, getSetting, upsertSetting } from "../db";

export interface UseSettingsResult {
  is24h: boolean;
  setIs24h: (v: boolean) => void;
  minH: string;
  setMinH: (v: string) => void;
  minM: string;
  setMinM: (v: string) => void;
  minS: string;
  setMinS: (v: string) => void;
  maxH: string;
  setMaxH: (v: string) => void;
  maxM: string;
  setMaxM: (v: string) => void;
  maxS: string;
  setMaxS: (v: string) => void;
  defaultReminder: string;
  setDefaultReminder: (v: string) => void;
  settingsReady: boolean;
}

export function useSettings(): UseSettingsResult {
  const [is24h, setIs24h] = useState(true);
  const [minH, setMinH] = useState("00");
  const [minM, setMinM] = useState("00");
  const [minS, setMinS] = useState("00");
  const [maxH, setMaxH] = useState("23");
  const [maxM, setMaxM] = useState("59");
  const [maxS, setMaxS] = useState("59");
  const [defaultReminder, setDefaultReminder] = useState("10");
  const [settingsReady, setSettingsReady] = useState(false);

  // Guard: don't persist until the initial load is complete
  const persistRef = useRef(false);

  useEffect(() => {
    const load = async () => {
      await getDb();

      const saved24h = await getSetting("is24h");
      const savedMinH = await getSetting("min_h");
      const savedMinM = await getSetting("min_m");
      const savedMinS = await getSetting("min_s");
      const savedMaxH = await getSetting("max_h");
      const savedMaxM = await getSetting("max_m");
      const savedMaxS = await getSetting("max_s");
      const savedDefaultReminder = await getSetting("default_reminder");

      if (saved24h !== null) setIs24h(saved24h === "true");
      if (savedMinH !== null) setMinH(savedMinH);
      if (savedMinM !== null) setMinM(savedMinM);
      if (savedMinS !== null) setMinS(savedMinS);
      if (savedMaxH !== null) setMaxH(savedMaxH);
      if (savedMaxM !== null) setMaxM(savedMaxM);
      if (savedMaxS !== null) setMaxS(savedMaxS);
      if (savedDefaultReminder !== null) setDefaultReminder(savedDefaultReminder);

      persistRef.current = true;
      setSettingsReady(true);
    };

    load();
  }, []);

  useEffect(() => {
    if (!persistRef.current) return;
    upsertSetting("is24h", String(is24h));
  }, [is24h]);

  useEffect(() => {
    if (!persistRef.current) return;
    upsertSetting("min_h", minH);
    upsertSetting("min_m", minM);
    upsertSetting("min_s", minS);
  }, [minH, minM, minS]);

  useEffect(() => {
    if (!persistRef.current) return;
    upsertSetting("max_h", maxH);
    upsertSetting("max_m", maxM);
    upsertSetting("max_s", maxS);
  }, [maxH, maxM, maxS]);

  useEffect(() => {
    if (!persistRef.current) return;
    upsertSetting("default_reminder", defaultReminder);
  }, [defaultReminder]);

  return {
    is24h,
    setIs24h,
    minH,
    setMinH,
    minM,
    setMinM,
    minS,
    setMinS,
    maxH,
    setMaxH,
    maxM,
    setMaxM,
    maxS,
    setMaxS,
    defaultReminder,
    setDefaultReminder,
    settingsReady,
  };
}
