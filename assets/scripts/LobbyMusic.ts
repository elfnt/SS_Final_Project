const { ccclass, property } = cc._decorator;

@ccclass
export default class BackgroundMusic extends cc.Component {

    @property({ type: cc.AudioClip })
    bgmClip: cc.AudioClip = null;

    onLoad() {
        cc.audioEngine.stopMusic(); // 停掉其他音樂（避免跨 scene 重複）
        cc.audioEngine.playMusic(this.bgmClip, true); // 播放背景音樂，loop = true
    }
}