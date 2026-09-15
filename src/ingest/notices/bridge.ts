import {Capacitor, registerPlugin} from '@capacitor/core';
import type {Notice} from './parse';

export type NoticeAccess = {granted: boolean; sources: string[]};
export type NoticeSource = {id: string; label: string};

export const Notices = registerPlugin<{
  access(): Promise<NoticeAccess>;
  openSettings(): Promise<void>;
  installed(): Promise<{apps: NoticeSource[]}>;
  listen(options: {sources: string[]}): Promise<void>;
  captured(): Promise<{notices: Notice[]}>;
  forget(options: {ids: string[]}): Promise<void>;
}>('KairosNotices');

/**
 * Reading the phone's own bank notifications, from the web layer's side.
 *
 * Android has no permission for "only my bank's notifications": a listener sees every notification on the
 * phone. So nothing is captured until the person both grants that access and names the apps to watch, and
 * the native side drops everything from any other app before it is ever stored.
 *
 * Off the phone this is inert rather than broken — the design preview has no notifications to read, and
 * pretending otherwise would put invented purchases in front of someone.
 */
export const noticesAvailable = () => Capacitor.isNativePlatform();

export async function noticeAccess(): Promise<NoticeAccess> {
  if (!noticesAvailable()) return {granted: false, sources: []};
  return Notices.access();
}

export async function capturedNotices(): Promise<Notice[]> {
  if (!noticesAvailable()) return [];
  return (await Notices.captured()).notices;
}

export async function forgetNotices(ids: string[]): Promise<void> {
  if (!noticesAvailable() || !ids.length) return;
  await Notices.forget({ids});
}

export async function watchSources(sources: string[]): Promise<void> {
  if (!noticesAvailable()) return;
  await Notices.listen({sources});
}

export async function installedSources(): Promise<NoticeSource[]> {
  if (!noticesAvailable()) return [];
  return (await Notices.installed()).apps;
}
