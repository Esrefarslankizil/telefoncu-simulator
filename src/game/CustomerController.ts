import { Group, Mesh } from "three";
import type { AudioSystem } from "../core/AudioSystem";
import type { SeededRNG } from "../core/SeededRNG";
import type { GameStore } from "../core/GameStore";
import type { CustomerEncounter } from "./GameTypes";
import { generateCustomerEncounter } from "../data/PhoneCatalog";

export type CustomerState = "WAITING" | "WALKING_IN" | "PLACING_PHONE" | "INTERACTING" | "WALKING_OUT";

export interface CustomerControllerOptions {
  readonly audio: AudioSystem;
  readonly rng: SeededRNG;
  readonly store: GameStore;
  readonly customerGroup: Group;
  readonly legLeft: Mesh;
  readonly legRight: Mesh;
  readonly armLeft: Mesh;
  readonly armRight: Mesh;
  readonly headMesh: Mesh;
  readonly phone: Group;
  readonly notify: (msg: string) => void;
  readonly wakeRender: (ms?: number) => void;
  readonly onStateChanged: (state: CustomerState) => void;
  readonly onPhonePlaced: () => void;
  readonly openSpeechBubble: (text: string, speaker?: "customer" | "player") => void;
}

export class CustomerController {
  public state: CustomerState = "WAITING";
  public encounter: CustomerEncounter;
  public waitTimer = 32;
  public customersServedToday = 0;

  private readonly options: CustomerControllerOptions;
  private walkAnimCycle = 0;
  private placingTimer = 0;
  private phonePlacedSoundPlayed = false;

  public constructor(options: CustomerControllerOptions, initialStockCount: number) {
    this.options = options;
    this.encounter = generateCustomerEncounter(options.rng, options.store.getState().reputation, initialStockCount);
    options.store.setRngState(options.rng.getState());
  }

  public get isInteracting(): boolean {
    return this.state === "INTERACTING";
  }

  public nextEncounter(stockCount: number): CustomerEncounter {
    this.encounter = generateCustomerEncounter(this.options.rng, this.options.store.getState().reputation, stockCount);
    this.options.store.setRngState(this.options.rng.getState());
    return this.encounter;
  }

  public triggerArrival(stockCount: number): void {
    if (this.state !== "WAITING") return;
    this.nextEncounter(stockCount);

    this.state = "WALKING_IN";
    this.options.customerGroup.position.set(0, 0, 5.2);
    this.options.customerGroup.rotation.y = Math.PI;
    this.options.customerGroup.visible = true;
    this.options.phone.visible = false;

    this.options.audio.playDoorBell();
    this.options.notify(`🔔 Kapı zili çaldı: ${this.encounter.customer.name} dükkâna girdi!`);
    this.options.onStateChanged(this.state);
  }

  public dismissCustomer(): void {
    this.state = "WALKING_OUT";
    this.options.customerGroup.rotation.y = 0;
    this.options.phone.visible = false;
    this.waitTimer = this.options.rng.nextInt(30, 40);
    this.options.notify(`Müşteri uğurlandı · Yeni müşteri ~${this.waitTimer} sn sonra gelecek.`);
    this.options.onStateChanged(this.state);
  }

  public updateTick(deltaSeconds: number, stockCount: number): void {
    if (this.state === "WAITING") {
      this.waitTimer -= deltaSeconds;
      if (this.waitTimer <= 0) {
        this.triggerArrival(stockCount);
      }
    } else if (this.state === "WALKING_IN") {
      this.walkAnimCycle += deltaSeconds * 7.5;
      this.options.customerGroup.position.z -= deltaSeconds * 1.6;
      this.options.legLeft.rotation.x = Math.sin(this.walkAnimCycle) * 0.45;
      this.options.legRight.rotation.x = -Math.sin(this.walkAnimCycle) * 0.45;
      this.options.armLeft.rotation.x = -Math.sin(this.walkAnimCycle) * 0.35;
      this.options.armRight.rotation.x = Math.sin(this.walkAnimCycle) * 0.35;
      this.options.customerGroup.position.y = Math.abs(Math.sin(this.walkAnimCycle * 2)) * 0.03;
      this.options.wakeRender(200);

      if (this.options.customerGroup.position.z <= 1.48) {
        this.options.customerGroup.position.z = 1.45;
        this.options.customerGroup.position.y = 0;
        this.options.legLeft.rotation.x = 0;
        this.options.legRight.rotation.x = 0;
        this.options.armLeft.rotation.x = -0.15;
        this.options.armRight.rotation.x = 0.2;

        if (this.encounter.customer.intent === "buy") {
          this.state = "INTERACTING";
          this.options.phone.visible = false;
          this.options.notify(`🗣️ ${this.encounter.customer.name}: "${this.encounter.customer.speechText}"`);
          this.options.openSpeechBubble(this.encounter.customer.speechText);
          this.options.onStateChanged(this.state);
        } else {
          this.state = "PLACING_PHONE";
          this.placingTimer = 0;
          this.phonePlacedSoundPlayed = false;
          this.options.phone.visible = true;
          this.options.onStateChanged(this.state);
        }
      }
    } else if (this.state === "PLACING_PHONE") {
      this.placingTimer += deltaSeconds;
      const t = Math.min(1, this.placingTimer / 1.7);

      this.options.headMesh.rotation.x = Math.sin(t * 24) * 0.08;
      this.options.headMesh.rotation.y = Math.cos(t * 12) * 0.06;

      if (t < 0.6) {
        const easeIn = t / 0.6;
        this.options.armRight.rotation.x = 0.2 + easeIn * 0.75;
        this.options.phone.position.set(0.12, 1.42 - easeIn * 0.16, 0.48 - easeIn * 0.26);
      } else {
        const easeOut = (t - 0.6) / 0.4;
        this.options.armRight.rotation.x = 0.95 - easeOut * 0.65;
        this.options.phone.position.set(0.12, 1.26 - easeOut * 0.08, 0.22);
        if (!this.phonePlacedSoundPlayed && t >= 0.72) {
          this.options.audio.playTap();
          this.phonePlacedSoundPlayed = true;
        }
      }
      this.options.wakeRender(200);

      if (this.placingTimer >= 1.7) {
        this.state = "INTERACTING";
        this.options.armRight.rotation.x = 0.2;
        this.options.headMesh.rotation.set(0, 0, 0);
        this.options.phone.position.set(0.12, 1.18, 0.22);
        this.options.notify("Cihaz tezgâha bırakıldı.");
        this.options.openSpeechBubble(this.encounter.customer.speechText);
        this.options.onPhonePlaced();
        this.options.onStateChanged(this.state);
      }
    } else if (this.state === "WALKING_OUT") {
      this.walkAnimCycle += deltaSeconds * 7.5;
      this.options.customerGroup.position.z += deltaSeconds * 1.6;
      this.options.legLeft.rotation.x = Math.sin(this.walkAnimCycle) * 0.45;
      this.options.legRight.rotation.x = -Math.sin(this.walkAnimCycle) * 0.45;
      this.options.armLeft.rotation.x = -Math.sin(this.walkAnimCycle) * 0.35;
      this.options.armRight.rotation.x = Math.sin(this.walkAnimCycle) * 0.35;
      this.options.customerGroup.position.y = Math.abs(Math.sin(this.walkAnimCycle * 2)) * 0.03;
      this.options.wakeRender(200);

      if (this.options.customerGroup.position.z >= 5.1) {
        this.options.customerGroup.visible = false;
        this.options.legLeft.rotation.x = 0;
        this.options.legRight.rotation.x = 0;
        this.options.armLeft.rotation.x = 0;
        this.options.armRight.rotation.x = 0;
        this.state = "WAITING";
        this.options.onStateChanged(this.state);
      }
    } else if (this.state === "INTERACTING") {
      this.options.customerGroup.position.y = Math.sin(performance.now() * 0.002) * 0.012;
    }
  }
}
