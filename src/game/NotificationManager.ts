export type NotificationTone = 'cyan' | 'gold' | 'purple' | 'emerald' | 'rose';

export type NotificationCategory =
  | 'COIN'
  | 'COMBO'
  | 'NEAR_MISS'
  | 'FLIGHT'
  | 'POWERUP'
  | 'SYSTEM';

export interface ActiveGameplayNotification {
  id: number;
  category: NotificationCategory;
  text: string;
  subtext?: string;
  tone: NotificationTone;
  priority: number;
  accumulatedPoints: number;
  remainingMs: number;
  totalMs: number;
  fadingOut: boolean;
}

export interface HudScoreFeedback {
  id: number;
  text: string;
  tone: NotificationTone;
  remainingMs: number;
}

interface QueuedNotification {
  category: NotificationCategory;
  text: string;
  subtext?: string;
  tone: NotificationTone;
  priority: number;
  points: number;
  durationMs: number;
  queuedAtMs: number;
}

/**
 * Single Notification Manager for Flying Car Rush 3D.
 * Guarantees at most ONE compact top-center notification at a time,
 * merges consecutive coin/combo pickups, prioritizes Near-Miss & Flight rewards,
 * and automatically fades out notifications on strict millisecond budgets.
 */
export class NotificationManager {
  private current: ActiveGameplayNotification | null = null;
  private queue: QueuedNotification | null = null; // Max queue depth of 1 so old messages never accumulate
  private scoreFeedback: HudScoreFeedback | null = null;
  private nextId = 1;
  private lastEventSignature = '';
  private lastEventTimeMs = 0;

  /**
   * Trigger a compact HUD-adjacent score delta (+20, +45, etc.) next to the Score box.
   */
  public triggerScoreDelta(points: number, tone: NotificationTone = 'gold'): void {
    if (points <= 0) return;
    // Merge if another score delta is still fresh (< 350ms old)
    if (this.scoreFeedback && this.scoreFeedback.remainingMs > 200) {
      const prevVal = parseInt(this.scoreFeedback.text.replace(/[^0-9]/g, ''), 10) || 0;
      const merged = prevVal + points;
      this.scoreFeedback = {
        id: this.nextId++,
        text: `+${merged}`,
        tone,
        remainingMs: 550,
      };
      return;
    }

    this.scoreFeedback = {
      id: this.nextId++,
      text: `+${points}`,
      tone,
      remainingMs: 550,
    };
  }

  /**
   * Record a coin & optional combo pickup.
   * Coin notifications last 600ms; Combo notifications last 1000ms.
   */
  public notifyCoinAndCombo(points: number, comboMultiplier: number, comboCount: number): void {
    this.triggerScoreDelta(points, 'gold');

    const isCombo = comboMultiplier > 1 && (comboCount % 2 === 0 || comboCount >= 4);
    const durationMs = isCombo ? 1000 : 600;
    const priority = isCombo ? 2 : 1;

    // If current notification is already COIN or COMBO, merge in-place instead of overlapping or queuing!
    if (
      this.current &&
      (this.current.category === 'COIN' || this.current.category === 'COMBO')
    ) {
      const totalPts = this.current.accumulatedPoints + points;
      this.current.id = this.nextId++;
      this.current.category = isCombo ? 'COMBO' : this.current.category;
      this.current.tone = 'gold';
      this.current.priority = Math.max(this.current.priority, priority);
      this.current.accumulatedPoints = totalPts;
      this.current.text =
        comboMultiplier > 1 ? `COMBO x${comboMultiplier}` : `+${totalPts} COIN`;
      this.current.subtext = comboMultiplier > 1 ? `+${totalPts} PTS` : undefined;
      this.current.remainingMs = durationMs;
      this.current.totalMs = durationMs;
      this.current.fadingOut = false;
      return;
    }

    // If a higher-priority notification (e.g. NEAR MISS or SKY CLEAR) is currently showing:
    if (this.current && this.current.priority > priority) {
      // Only queue if this is a notable combo milestone (x2+); ordinary coins just show in the HUD score delta
      if (isCombo && comboCount % 4 === 0) {
        this.queue = {
          category: 'COMBO',
          text: `COMBO x${comboMultiplier}`,
          subtext: `+${points} PTS`,
          tone: 'gold',
          priority: 2,
          points,
          durationMs: 950,
          queuedAtMs: performance.now(),
        };
      }
      return;
    }

    this.setCurrent({
      category: isCombo ? 'COMBO' : 'COIN',
      text: comboMultiplier > 1 ? `COMBO x${comboMultiplier}` : `+${points} COIN`,
      subtext: comboMultiplier > 1 ? `+${points} PTS` : undefined,
      tone: 'gold',
      priority,
      points,
      durationMs,
      queuedAtMs: performance.now(),
    });
  }

  /**
   * Record a high-priority gameplay event (Near Miss, Sky Clear, Flight Mode, Powerup).
   */
  public notifyEvent(
    category: NotificationCategory,
    text: string,
    subtext: string | undefined,
    tone: NotificationTone,
    points = 0,
    durationMs = 1050,
    priority = 3
  ): void {
    const now = performance.now();
    const signature = `${category}:${text}`;

    // Prevent duplicate notification from the same event within 180ms
    if (signature === this.lastEventSignature && now - this.lastEventTimeMs < 180) {
      return;
    }
    this.lastEventSignature = signature;
    this.lastEventTimeMs = now;

    if (points > 0) {
      this.triggerScoreDelta(points, tone);
    }

    // If no notification is active, or the active one is lower priority (like COIN), replace immediately
    if (!this.current || this.current.priority < priority) {
      this.setCurrent({
        category,
        text,
        subtext,
        tone,
        priority,
        points,
        durationMs,
        queuedAtMs: now,
      });
      return;
    }

    // If same category occurs rapidly (e.g. double NEAR MISS or double SKY CLEAR), merge points & refresh timer
    if (this.current.category === category) {
      const totalPts = this.current.accumulatedPoints + points;
      this.current.id = this.nextId++;
      this.current.accumulatedPoints = totalPts;
      this.current.text = text;
      this.current.subtext = totalPts > 0 ? `+${totalPts} PTS` : subtext;
      this.current.remainingMs = durationMs;
      this.current.totalMs = durationMs;
      this.current.fadingOut = false;
      return;
    }

    // If current notification is nearly finished (< 300ms left), replace it immediately; otherwise store in the single-slot queue
    if (this.current.remainingMs < 300) {
      this.setCurrent({
        category,
        text,
        subtext,
        tone,
        priority,
        points,
        durationMs,
        queuedAtMs: now,
      });
    } else if (!this.queue || priority >= this.queue.priority) {
      this.queue = {
        category,
        text,
        subtext,
        tone,
        priority,
        points,
        durationMs,
        queuedAtMs: now,
      };
    }
  }

  private setCurrent(item: QueuedNotification): void {
    this.current = {
      id: this.nextId++,
      category: item.category,
      text: item.text,
      subtext: item.subtext,
      tone: item.tone,
      priority: item.priority,
      accumulatedPoints: item.points,
      remainingMs: item.durationMs,
      totalMs: item.durationMs,
      fadingOut: false,
    };
  }

  public update(dtSeconds: number): void {
    const dtMs = dtSeconds * 1000;

    if (this.scoreFeedback) {
      this.scoreFeedback.remainingMs -= dtMs;
      if (this.scoreFeedback.remainingMs <= 0) {
        this.scoreFeedback = null;
      }
    }

    if (this.current) {
      this.current.remainingMs -= dtMs;
      // Trigger fade-out + upward glide during the final 180ms
      this.current.fadingOut = this.current.remainingMs <= 180;

      if (this.current.remainingMs <= 0) {
        this.current = null;
      }
    }

    // If current slot is now free and we have a non-stale queued item (< 900ms old), promote it
    if (!this.current && this.queue) {
      const ageMs = performance.now() - this.queue.queuedAtMs;
      if (ageMs <= 900) {
        this.setCurrent(this.queue);
      }
      this.queue = null;
    }
  }

  public getActiveNotification(): ActiveGameplayNotification | null {
    return this.current ? { ...this.current } : null;
  }

  public getScoreFeedback(): HudScoreFeedback | null {
    return this.scoreFeedback ? { ...this.scoreFeedback } : null;
  }

  public clear(): void {
    this.current = null;
    this.queue = null;
    this.scoreFeedback = null;
    this.lastEventSignature = '';
    this.lastEventTimeMs = 0;
  }
}
