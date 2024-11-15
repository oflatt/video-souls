const FRAME_LENGTH = 0.05;

type AttackData = {
  // Required information
  time: DOMHighResTimeStamp,
  direction: AttackDirection,
  // Potential parameters
  warningTime?: number,
  damageDelay?: number,
  attackDamage?: number
};

type AttackWarning = {
  attack: AttackData,
  timeSinceWarning: number
};

type LevelData = {
  videoID: string,
  attacks: AttackData[],
  version: number
};

class Level {
  static LEVEL_VERSION = 2;
  attacks: AttackData[];

  constructor(public videoID: string, attackData?: AttackData[]) {
    if (attackData == null) {
      this.attacks = [];
    } else {
      this.attacks = Array.from(attackData);
    }
  }

  static fromObject(data: any) {
    // Verify level data format
    if (!('version' in data) || data['version'] !== Level.LEVEL_VERSION) {
      throw "version";
    }
    if (!('videoID' in data) || typeof data['videoID'] != "string") {
      throw "videoID";
    }
    if (!('attacks' in data) || !Array.isArray(data['attacks'])) {
      throw "attacks";
    }
    const verifyAttack = (attack: any) => {
      return ('time' in attack && typeof attack['time'] == "number")
        && ('direction' in attack && attack['direction'] in AttackDirection);
    };
    for (let i = 0; i < data['attacks'].length; i++) {
      if (!verifyAttack(data['attacks'][i])) {
        throw `attacks[${i}]`;
      }
    }
    return new Level(data['videoID'], data['attacks']);
  }

  toObject(): LevelData {
    return {
      videoID: this.videoID,
      attacks: Array.from(this.attacks),
      version: Level.LEVEL_VERSION
    };
  }

  // Warnings that may be active at a certain time
  getActiveWarnings(endTime: DOMHighResTimeStamp, defaultWarningTime: number = 1) {
    let warnings: AttackWarning[] = [];
    for (let attack of this.attacks) {
      let warningStart = attack.time - (attack.warningTime != null ? attack.warningTime : defaultWarningTime);
      if (warningStart <= endTime && endTime < attack.time) {
        warnings.push({
          attack: attack,
          timeSinceWarning: endTime - warningStart
        });
      }
    }
    return warnings;
  }

  // Attacks that can be parried within a short interval
  getCurrentAttacks(startTime: DOMHighResTimeStamp, endTime: DOMHighResTimeStamp) {
    return this.attacks.filter(attack => startTime < attack.time && attack.time <= endTime);
  }

  // Damage taken within a short time interval
  getCurrentDamages(startTime: DOMHighResTimeStamp, endTime: DOMHighResTimeStamp, defaultDamageDelay: number = 1) {
    return this.attacks.filter(attack => {
      let damageTime = attack.time + (attack.damageDelay != null ? attack.damageDelay : defaultDamageDelay);
      return startTime < damageTime && damageTime <= endTime;
    });
  }
}
