import type {Driver} from '../core/db/driver';
import {defaultNotices,noticeKinds,type NoticePreferences} from '../intelligence/notifications';
export function notificationRepository(driver:Driver){
 async function preferences():Promise<NoticePreferences>{const r=(await driver.query("SELECT value FROM app_settings WHERE key='notifications:preferences'"))[0];const saved=r?JSON.parse(String(r.value)) as Partial<NoticePreferences>:{};return Object.fromEntries(noticeKinds.map(k=>[k,saved[k]===true])) as NoticePreferences;}
 async function save(value:NoticePreferences){if(noticeKinds.some(k=>typeof value[k]!=='boolean')||Object.keys(value).some(k=>!noticeKinds.includes(k as typeof noticeKinds[number])))throw new Error('Choose the notification types to enable.');await driver.execute("INSERT OR REPLACE INTO app_settings(key,value) VALUES('notifications:preferences',?)",[JSON.stringify({...defaultNotices,...value})]);}
 return {preferences,save};
}
