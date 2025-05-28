const { ccclass, property } = cc._decorator;

@ccclass
export default class UIButtonSound extends cc.Component {

    @property({ type: cc.AudioClip })
    hoverSound: cc.AudioClip = null;

    @property({ type: cc.AudioClip })
    clickSound: cc.AudioClip = null;

    onLoad() {
        // 註冊滑鼠事件
        this.node.on(cc.Node.EventType.MOUSE_ENTER, this.playHoverSound, this);
        this.node.on(cc.Node.EventType.MOUSE_DOWN, this.playClickSound, this);
    }

    playHoverSound() {
        if (this.hoverSound) {
            cc.audioEngine.playEffect(this.hoverSound, false);
        }
    }

    playClickSound() {
        if (this.clickSound) {
            cc.audioEngine.playEffect(this.clickSound, false);
        }
    }
}
