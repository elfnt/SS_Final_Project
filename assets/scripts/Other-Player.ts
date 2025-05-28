// Learn TypeScript:
//  - https://docs.cocos.com/creator/manual/en/scripting/typescript.html
// Learn Attribute:
//  - https://docs.cocos.com/creator/manual/en/scripting/reference/attributes.html
// Learn life-cycle callbacks:
//  - https://docs.cocos.com/creator/manual/en/scripting/life-cycle-callbacks.html

import { FirebaseManager } from "./FirebaseManager";

const { ccclass, property } = cc._decorator;

@ccclass
export default class OtherPlayer extends cc.Component {
    @property(cc.Label)
    nameLabel: cc.Label = null;
    
    @property
    playerId: string = "";
    
    private anim: cc.Animation = null;
    private lastPosition: cc.Vec2 = cc.v2(0, 0);
    
    onLoad() {
        this.anim = this.getComponent(cc.Animation);
        
        // Set initial position
        this.node.position = cc.v3(this.lastPosition.x, this.lastPosition.y, 0);
    }
    
    start() {
        this.listenForUpdates();
    }
    
    setPlayerInfo(playerId: string, initialData: any) {
        this.playerId = playerId;
        
        // Set name label
        if (this.nameLabel && initialData.name) {
            this.nameLabel.string = initialData.name;
        }
        
        // Set initial position
        if (initialData.position) {
            this.node.position = cc.v3(initialData.position.x, initialData.position.y);
            this.lastPosition = cc.v2(initialData.position.x, initialData.position.y);
        }
    }
    
    listenForUpdates() {
        if (!this.playerId) return;
        
        const firebaseManager = FirebaseManager.getInstance();
        firebaseManager.listenToPlayerData(this.playerId, (data) => {
            if (!data) return;
            
            // Update name if changed
            if (this.nameLabel && data.name && this.nameLabel.string !== data.name) {
                this.nameLabel.string = data.name;
            }
            
            // Update position
            if (data.position) {
                this.lastPosition = cc.v2(data.position.x, data.position.y);
            }
        });
    }
    
    update(dt: number) {
        // Smoothly move to the target position
        const currentPos = this.node.position;
        const targetPos = cc.v3(this.lastPosition.x, this.lastPosition.y);
        
        // Only move if we need to
        if (currentPos.sub(targetPos).magSqr() > 1) {
            // Interpolate position for smooth movement
            const newPos = currentPos.lerp(targetPos, dt * 5);
            this.node.position = newPos;
            
            // Update animation
            if (this.anim) {
                const movingHorizontally = Math.abs(currentPos.x - this.lastPosition.x) > 0.5;
                if (movingHorizontally) {
                    // Update facing direction
                    if (this.lastPosition.x > currentPos.x) {
                        this.node.scaleX = -Math.abs(this.node.scaleX); // Face left
                    } else {
                        this.node.scaleX = Math.abs(this.node.scaleX); // Face right
                    }
                    
                    this.anim.play("Move");
                } else {
                    this.anim.play("Default");
                }
            }
        } else {
            // If not moving, play idle animation
            if (this.anim && this.anim.currentClip && this.anim.currentClip.name !== "Default") {
                this.anim.play("Default");
            }
        }
    }
}