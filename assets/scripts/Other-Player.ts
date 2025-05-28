// Learn TypeScript:
//  - https://docs.cocos.com/creator/manual/en/scripting/typescript.html
// Learn Attribute:
//  - https://docs.cocos.com/creator/manual/en/scripting/reference/attributes.html
// Learn life-cycle callbacks:
//  - https://docs.cocos.com/creator/manual/en/scripting/life-cycle-callbacks.html

const { ccclass, property } = cc._decorator;

@ccclass
export default class OtherPlayer extends cc.Component {
  @property(sp.Skeleton)
  playerSkeleton: sp.Skeleton = null;

  @property(cc.Label)
  playerNameLabel: cc.Label = null;

  private _playerId: string = "";
  private _databaseRef: firebase.database.Reference = null;
  private _targetPosition: cc.Vec3 = cc.v3(0, 0, 0);
  private _previousPosition: cc.Vec3 = cc.v3(0, 0, 0);
  private _lastState: string = "idle";

  private _lastUpdateTime: number = 0;
  private _disconnectThreshold: number = 5000; // ms, increase for more tolerance
  private _interpolationFactor: number = 0.1;

  onLoad() {
    if (this.playerSkeleton) {
      this.playerSkeleton.animation = "wait";
    }
  }

  start() {}

  /**
   * Call this after instantiating the prefab, passing the playerId and playerName.
   */
  public setupOtherPlayer(playerId: string, playerName: string) {
    this._playerId = playerId;
    if (this.playerNameLabel) {
      this.playerNameLabel.string = playerName;
    }
    this.setupFirebaseListener();
  }

  private setupFirebaseListener() {
    if (!this._playerId) return;
    this._databaseRef = firebase.database().ref(`players/${this._playerId}`);
    this._databaseRef.on("value", this.onPlayerDataUpdate.bind(this));
  }

  private onPlayerDataUpdate(snapshot: firebase.database.DataSnapshot) {
    const playerData = snapshot.val();
    if (!playerData) return;

    // Update name if it changes
    if (this.playerNameLabel && playerData.name) {
      this.playerNameLabel.string = playerData.name;
    }

    // Setting the positions and animation states from the database values
    this._previousPosition = this._targetPosition.clone();
    this._targetPosition = cc.v3(playerData.position.x, playerData.position.y);

    if (this._lastState !== playerData.state) {
      this._lastState = playerData.state;
      if (this.playerSkeleton) {
        this.playerSkeleton.animation =
          playerData.state === "walking" ? "move" : "wait";
      }
    }

    // Flip skeleton based on movement direction
    if (this._targetPosition.x !== this._previousPosition.x && this.playerSkeleton) {
      this.playerSkeleton.node.scaleX =
        this._targetPosition.x > this._previousPosition.x ? 0.75 : -0.75;
    }

    this._lastUpdateTime = playerData.lastUpdate || Date.now();
  }

  update(dt: number) {
    this.handleMovement(dt);
    this.checkDisconnection();

    // Prevent name label from mirroring
    if (this.playerNameLabel && this.playerSkeleton) {
      this.playerNameLabel.node.scaleX = Math.abs(1 / (this.playerSkeleton.node.scaleX || 1));
    }
  }

  private handleMovement(dt: number) {
    if (!this._targetPosition.equals(this.node.position)) {
      const newPosition = cc.v3(
        cc.misc.lerp(
          this.node.position.x,
          this._targetPosition.x,
          this._interpolationFactor,
        ),
        cc.misc.lerp(
          this.node.position.y,
          this._targetPosition.y,
          this._interpolationFactor,
        ),
        0,
      );
      this.node.position = newPosition;
    }
  }

  private checkDisconnection() {
    const currentTime = Date.now();
    if (currentTime - this._lastUpdateTime > this._disconnectThreshold) {
      this.removePlayer();
    }
  }

  private removePlayer() {
    if (this._databaseRef) {
      this._databaseRef.off();
    }
    this.node.removeFromParent();
  }

  onDestroy() {
    if (this._databaseRef) {
      this._databaseRef.off();
    }
  }
}