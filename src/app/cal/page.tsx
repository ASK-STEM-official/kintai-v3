"use client";

import { useState, useRef, useCallback } from 'react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import FaceAuth, { type FaceAuthHandle } from '@/components/kiosk/FaceAuth';

interface Config {
  threshold: number;
  cooldown: number;
  blinks_required: number;
  ear_threshold: number;
  scale_factor: number;
  alpha: number;
  clahe: number;
  clahe_clip: number;
}

const DEFAULTS: Config = {
  threshold: 0.45,
  cooldown: 5,
  blinks_required: 2,
  ear_threshold: 0.25,
  scale_factor: 0.25,
  alpha: 0.05,
  clahe: 1.0,
  clahe_clip: 2.0,
};

interface ParamRowProps {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}

function ParamRow({ label, description, value, min, max, step, onChange, format }: ParamRowProps) {
  const display = format ? format(value) : value.toString();
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-white">{label}</span>
          <p className="text-xs text-gray-400">{description}</p>
        </div>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
          }}
          className="w-20 text-right bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
        />
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        className="w-full"
      />
      <div className="flex justify-between text-xs text-gray-600">
        <span>{format ? format(min) : min}</span>
        <span className="text-blue-400 font-mono">{display}</span>
        <span>{format ? format(max) : max}</span>
      </div>
    </div>
  );
}

export default function CalPage() {
  const [cfg, setCfg] = useState<Config>({ ...DEFAULTS });
  const [sent, setSent] = useState(false);
  const faceAuthRef = useRef<FaceAuthHandle>(null);

  const set = useCallback(<K extends keyof Config>(key: K, value: Config[K]) => {
    setCfg((prev) => ({ ...prev, [key]: value }));
    setSent(false);
  }, []);

  const handleSend = useCallback(() => {
    faceAuthRef.current?.sendConfig(cfg as unknown as Record<string, number>);
    setSent(true);
    setTimeout(() => setSent(false), 2000);
  }, [cfg]);

  const handleReset = useCallback(() => {
    setCfg({ ...DEFAULTS });
    setSent(false);
  }, []);

  return (
    <div className="h-screen w-screen bg-gray-950 text-white flex flex-col overflow-hidden">
      <header className="flex items-center gap-4 px-6 py-3 border-b border-gray-800 shrink-0">
        <h1 className="text-lg font-bold">顔認証 キャリブレーション</h1>
        <Badge variant="outline" className="text-xs text-gray-400">認証不要</Badge>
        <p className="text-xs text-gray-500 ml-auto">変更は「送信」を押すまで反映されません</p>
      </header>

      <div className="flex-1 flex min-h-0 gap-0">
        {/* カメラプレビュー */}
        <div className="flex-1 flex items-center justify-center bg-black min-w-0 p-4">
          <FaceAuth
            ref={faceAuthRef}
            onResult={() => {}}
            prominent
            boxClassName="h-full w-full max-h-[calc(100vh-56px)] max-w-full"
          />
        </div>

        {/* パラメータパネル */}
        <aside className="w-80 shrink-0 flex flex-col bg-gray-900 border-l border-gray-800 overflow-y-auto">
          <div className="p-4 space-y-6">

            <section className="space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500">認識</h2>
              <ParamRow
                label="認識閾値"
                description="距離が小さいほど厳格。小さすぎると未登録者に反応しなくなる"
                value={cfg.threshold}
                min={0.20}
                max={0.80}
                step={0.01}
                onChange={(v) => set('threshold', v)}
              />
              <ParamRow
                label="まばたき要求数"
                description="認証前に必要なまばたき回数（0で無効）"
                value={cfg.blinks_required}
                min={0}
                max={5}
                step={1}
                onChange={(v) => set('blinks_required', v)}
              />
              <ParamRow
                label="EAR閾値"
                description="目の縦横比がこの値を下回るとまばたき判定"
                value={cfg.ear_threshold}
                min={0.10}
                max={0.40}
                step={0.01}
                onChange={(v) => set('ear_threshold', v)}
              />
            </section>

            <section className="space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500">打刻制御</h2>
              <ParamRow
                label="クールダウン (秒)"
                description="同一人物の連続打刻を防ぐ待機時間"
                value={cfg.cooldown}
                min={1}
                max={30}
                step={1}
                onChange={(v) => set('cooldown', v)}
                format={(v) => `${v}s`}
              />
            </section>

            <section className="space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500">逆光補正</h2>
              <ParamRow
                label="CLAHE 有効"
                description="1.0 = 有効、0.0 = 無効。逆光・暗所での認識精度改善"
                value={cfg.clahe}
                min={0.0}
                max={1.0}
                step={1.0}
                onChange={(v) => set('clahe', v)}
                format={(v) => v > 0 ? 'ON' : 'OFF'}
              />
              <ParamRow
                label="CLAHE クリップ限界"
                description="コントラスト強調の上限。大きいほど強調が強い（2.0 が標準）"
                value={cfg.clahe_clip}
                min={0.5}
                max={8.0}
                step={0.5}
                onChange={(v) => set('clahe_clip', v)}
              />
            </section>

            <section className="space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500">パフォーマンス</h2>
              <ParamRow
                label="スケール係数"
                description="検出処理前にリサイズする倍率。小さいほど高速・低精度"
                value={cfg.scale_factor}
                min={0.10}
                max={1.00}
                step={0.05}
                onChange={(v) => set('scale_factor', v)}
                format={(v) => `×${v.toFixed(2)}`}
              />
              <ParamRow
                label="適応学習率 α"
                description="認証成功時にエンコーディングを更新する速度"
                value={cfg.alpha}
                min={0.00}
                max={0.20}
                step={0.01}
                onChange={(v) => set('alpha', v)}
              />
            </section>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleSend}
                className={`flex-1 transition-colors ${sent ? 'bg-green-600 hover:bg-green-700' : ''}`}
              >
                {sent ? '送信済み' : '設定を送信'}
              </Button>
              <Button variant="outline" onClick={handleReset} className="shrink-0">
                リセット
              </Button>
            </div>

            <details className="text-xs text-gray-500 border border-gray-800 rounded p-3">
              <summary className="cursor-pointer select-none">現在の設定 (JSON)</summary>
              <pre className="mt-2 font-mono text-green-400 overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(cfg, null, 2)}
              </pre>
            </details>
          </div>
        </aside>
      </div>
    </div>
  );
}
