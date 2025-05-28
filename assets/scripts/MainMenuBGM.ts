const { ccclass, property } = cc._decorator;

@ccclass
export default class MainMenuBGM extends cc.Component {

    @property({ type: cc.AudioClip })
    bgm: cc.AudioClip = null;

    onLoad() {
        // 停止其他音樂，避免重疊
        cc.audioEngine.stopMusic();
        
        // 播放背景音樂，並設為循環播放
        cc.audioEngine.playMusic(this.bgm, true);
    }
}
