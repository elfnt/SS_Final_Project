const { ccclass, property } = cc._decorator;

@ccclass
export default class AudioManager extends cc.Component {

    @property({ type: cc.AudioClip })
    bgm: cc.AudioClip = null;

    private static instance: AudioManager = null;

    onLoad() {
        if (AudioManager.instance) {
            this.node.destroy(); // 已經有 BGM 就不重複
            return;
        }

        AudioManager.instance = this;
        cc.game.addPersistRootNode(this.node); // 加入常駐節點

        cc.audioEngine.playMusic(this.bgm, true); // 播放背景音樂（重複）
    }
}
