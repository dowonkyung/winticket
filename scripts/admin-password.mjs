import {DatabaseSync} from 'node:sqlite';
import {randomBytes,scryptSync} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),data=path.resolve(process.env.WINTICKET_DATA_DIR||path.join(root,'data'));
const username=process.env.WINTICKET_ADMIN_USERNAME,password=process.env.WINTICKET_ADMIN_PASSWORD;
if(!username||!/^[a-zA-Z0-9_.-]{3,64}$/.test(username)||!password||password.length<12){console.error('환경변수에 관리자 아이디(3~64자 영문/숫자)와 12자 이상의 비밀번호를 설정해 주세요.');process.exit(1);}
await mkdir(data,{recursive:true});const db=new DatabaseSync(path.join(data,'winticket.sqlite'));db.exec('PRAGMA busy_timeout=5000;');
db.exec('CREATE TABLE IF NOT EXISTS admins(username TEXT PRIMARY KEY,salt TEXT NOT NULL,password TEXT NOT NULL);');
const salt=randomBytes(16).toString('hex');db.prepare('INSERT INTO admins VALUES(?,?,?) ON CONFLICT(username) DO UPDATE SET salt=excluded.salt,password=excluded.password').run(username,salt,scryptSync(password,salt,64).toString('hex'));
if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'").get())db.prepare('DELETE FROM sessions WHERE admin=?').run(username);
delete process.env.WINTICKET_ADMIN_PASSWORD;db.close();console.log('관리자 비밀번호를 설정했습니다. 기존 로그인 세션은 해제되었습니다.');
