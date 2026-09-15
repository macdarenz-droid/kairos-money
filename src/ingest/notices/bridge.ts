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

/**
 * An install whose native side predates this feature answers "nothing captured" rather than throwing.
 * Reading notifications is an extra the ledger does not depend on, so its absence is a quiet no.
 */
async function ask<T>(call: () => Promise<T>, whenAbsent: T): Promise<T> {
  if (!noticesAvailable()) return whenAbsent;
  try { return await call(); } catch { return whenAbsent; }
}

export const noticeAccess = (): Promise<NoticeAccess> => ask(() => Notices.access(), {granted: false, sources: []});
export const capturedNotices = (): Promise<Notice[]> => ask(async () => (await Notices.captured()).notices, []);
export const installedSources = (): Promise<NoticeSource[]> => ask(async () => (await Notices.installed()).apps, []);
export const watchSources = (sources: string[]): Promise<void> => ask(() => Notices.listen({sources}), undefined);

export async function forgetNotices(ids: string[]): Promise<void> {
  if (!ids.length) return;
  // A failure to forget must be loud: silently keeping an answered notice asks the person again.
  if (noticesAvailable()) await Notices.forget({ids});
}
