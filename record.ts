var player: YT.Player;
var levelEditor: LevelEditor;
var playbackBar: HTMLElement;


class LevelEditor extends Level {
  static defaults = {
    warningTime: 1,
    damageDelay: 0.3,
    attackDamage: 0.1
  } as const;
  frameToAttack: Map<number, AttackData>;
  elements: Map<AttackData, HTMLElement>;
  selectedAttack: AttackData | null;
  selectionMode: "warning" | "delay" | null;

  constructor(videoID: string) {
    super(videoID);
    this.frameToAttack = new Map<number, AttackData>();
    this.elements = new Map<AttackData, HTMLElement>();
    this.selectedAttack = null;
    this.selectionMode = null;
  }

  createAttackAt(timestamp: DOMHighResTimeStamp) {
    // Disallow overlapping attacks
    let existingAttack = this.frameToAttack.get(this.frameIndex(timestamp));
    if (existingAttack != null) {
      this.deleteAttack(existingAttack);
    }
    let newAttack = {
      time: timestamp,
      direction: DirectionInputManager.getDirection(),
      warningTime: LevelEditor.defaults.warningTime,
      damageDelay: LevelEditor.defaults.damageDelay,
      attackDamage: LevelEditor.defaults.attackDamage
    };
    this.addAttack(newAttack);
    this.selectAttack(newAttack);
  }

  selectAttackAt(timestamp: DOMHighResTimeStamp) {
    let existingAttack = this.frameToAttack.get(this.frameIndex(timestamp));
    if (existingAttack != null) {
      this.selectAttack(existingAttack);
    }
  }

  removeSelectedAttack() {
    if (this.selectedAttack != null) {
      this.deleteAttack(this.selectedAttack);
    }
  }

  seekForward(seconds: number) {
    if (this.selectionMode == "delay") {
      // TODO
    } else if (this.selectionMode == "warning") {
      // TODO
    } else {
      playerSeekForward(seconds);
    }
  }

  private addAttack(attack: AttackData) {
    // Set up attack marker element
    const parentElement = document.querySelector<HTMLElement>("#playback-bar")!;
    const templateElement = document.querySelector<HTMLElement>(".attack-marker.template")!;
    let attackElement = <HTMLElement>templateElement.cloneNode(true); // Returns Node type by default
    attackElement.classList.remove("template");
    attackElement.style.left = `${timeToPx(attack.time)}px`;
    attackElement.style.setProperty('--height', `${25 + 15 * Math.random()}px`);
    attackElement.style.setProperty('--warning-offset', `${timeToPx(attack.warningTime)}px`);
    attackElement.style.setProperty('--damage-offset', `${timeToPx(attack.damageDelay)}px`);
    attackElement.querySelector(".marker-handle")!.addEventListener("click", event => {
      if (this.selectedAttack != attack) {
        event.stopPropagation();
        this.selectAttack(attack);
      }
    });
    this.elements.set(attack, attackElement);
    // Insert attack chronologically
    let index = this.attacks.findIndex(a => attack.time < a.time);
    if (index == -1) {
      parentElement.insertBefore(attackElement, null);
      this.attacks.push(attack);
    } else {
      parentElement.insertBefore(attackElement, this.elements.get(this.attacks[index])!);
      this.attacks.splice(index, 0, attack);
    }
    this.frameToAttack.set(this.frameIndex(attack), attack);
  }

  private deleteAttack(attack: AttackData) {
    let frameIndex = this.frameIndex(attack);
    if (this.frameToAttack.get(frameIndex) == attack) {
      this.frameToAttack.delete(frameIndex);
    }
    this.elements.get(attack)!.remove();
    let index = this.attacks.indexOf(attack);
    this.attacks.splice(index, 1);
    if (this.selectedAttack == attack) {
      this.selectedAttack = null;
    }
  }

  private selectAttack(attack: AttackData | null) {
    this.selectedAttack = null;
    for (let element of this.elements.values()) {
      element.classList.remove("selected");
    }
    if (attack != null) {
      this.selectedAttack = attack;
      this.elements.get(attack)!.classList.add("selected");
      player.seekTo(attack.time, true);
    }
  }

  frameIndex(timestamp: DOMHighResTimeStamp): number;
  frameIndex(attack: AttackData): number;
  frameIndex(timeOrAttack: DOMHighResTimeStamp | AttackData) {
    if (typeof timeOrAttack == "number") {
      return Math.floor(timeOrAttack / FRAME_LENGTH);
    }
    return Math.floor(timeOrAttack.time / FRAME_LENGTH);
  }
}


var onYouTubeIframeAPIReady = function() {
  getVideoID().then(videoID => {
    console.log(videoID);
    player = new YT.Player('video-player', {
      height: '100%',
      width: '100%',
      videoId: videoID,
      playerVars: {
        enablejsapi: 1,
        autoplay: 0,
        controls: 0,
        rel: 0,
        fs: 0,
        iv_load_policy: 3,
        showinfo: 0,
        cc_load_policy: 0,
        disablekb: 0,
        mute: 1,
      }
    });
    player.addEventListener("onReady", () => {
      player.setPlaybackQuality("highres");
      // Set length of playback bar
      playbackBar = document.querySelector<HTMLElement>("#playback-bar")!;
      const minLength = document.querySelector("#recording-controls")!.clientWidth - 120;
      let nFrames = player.getDuration() * 40;
      let multiplier = Math.max(minLength / nFrames, 1);
      playbackBar.style.width = `${nFrames * multiplier}px`;

      // Initialize level editor
      levelEditor = new LevelEditor(videoID);

      // Bind controls
      document.addEventListener("keydown", event => {
        switch (event.key) {
          case " ":
          case "k":
            if (player.getPlayerState() == YT.PlayerState.PLAYING) {
              player.pauseVideo();
            } else {
              player.playVideo();
            }
            break;
          case "ArrowLeft":
            levelEditor.seekForward(-1);
            break;
          case "ArrowRight":
            levelEditor.seekForward(1);
            break;
          case ",":
            levelEditor.seekForward(-0.05);
            break;
          case ".":
            levelEditor.seekForward(0.05);
            break;
          case "j":
            levelEditor.seekForward(-10);
            break;
          case "l":
            levelEditor.seekForward(10);
            break;
          case "Enter":
            levelEditor.createAttackAt(player.getCurrentTime());
            break;
          case "x":
            levelEditor.removeSelectedAttack();
            break;
          default:
            DirectionInputManager.processKeydown(event);
            return;
        }
        if (!event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
        }
      });
      document.addEventListener("keyup", event => {
        DirectionInputManager.processKeyup(event);
      });

      setInterval(updatePlaybackPoint, 50);

      playbackBar.addEventListener("mousedown", event => {
        if (event.button == 0) {
          let bbox = playbackBar.getBoundingClientRect();
          let fraction = (event.clientX - bbox.left) / bbox.width;
          player.seekTo(fraction * player.getDuration(), true);
        }
      });
    });
  }, console.error);
}

function timeToPx(time: number) {
  return time / player.getDuration() * playbackBar.clientWidth;
}

function updatePlaybackPoint() {
  const playbackPoint = document.querySelector<HTMLElement>("#playback-point")!;
  playbackPoint.style.left = `${timeToPx(player.getCurrentTime())}px`;
  // playbackPoint.scrollIntoView();
}

function playerSeekForward(seconds: number) {
  let targetTime = Math.min(Math.max(player.getCurrentTime() + seconds, 0), player.getDuration() - 0.05 * seconds);
  player.seekTo(targetTime, true);
  levelEditor.selectAttackAt(targetTime);
  updatePlaybackPoint();
}

function getVideoID() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("v")) {
    return Promise.resolve(params.get("v")!);
  }

  const videoIDDialog = document.querySelector<HTMLDialogElement>("#video-id-dialog")!;
  const videoIDInput = videoIDDialog.querySelector<HTMLInputElement>("#video-id-input")!;
  const videoIDForm = videoIDDialog.querySelector<HTMLFormElement>("#video-id-form")!;
  videoIDDialog.showPopover();
  videoIDInput.focus();

  const callback = (resolve: (value: string) => void, reject: (reason: any) => void) => {
    const pattern = /(?:(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/))?([^"&?/\s]{11})/;
    let value = videoIDInput.value;
    let match = value.match(pattern);
    if (match) {
      videoIDDialog.hidePopover();
      resolve(match[1]);
    } else {
      console.error(`Bad URL: ${value}`);
      videoIDForm.addEventListener("submit", callback.bind(videoIDForm, resolve, reject), {once: true});
    }
  };

  return new Promise<string>((resolve, reject) => {
    videoIDForm.addEventListener("submit", callback.bind(videoIDForm, resolve, reject), {once: true});
  });
}