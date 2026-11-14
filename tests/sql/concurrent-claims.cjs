// Exercise a real UNIQUE-index race using two independent psql connections.
// This runs only against the disposable PostgreSQL CI service.
'use strict';
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');

const users=[
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000004'
];

function psql(query){
  return new Promise((resolve,reject)=>{
    const child=spawn('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-c',query],{
      env:process.env,stdio:['ignore','pipe','pipe']
    });
    let stdout='',stderr='';
    child.stdout.on('data',chunk=>stdout+=chunk);
    child.stderr.on('data',chunk=>stderr+=chunk);
    child.on('error',reject);
    child.on('close',code=>resolve({code,stdout,stderr}));
  });
}

async function main(){
  const attempts=await Promise.all(users.map((uid,i)=>
    psql(`SET ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub','${uid}',false);
      SELECT public.iydu_set_username('${i?'racename':'RaceName'}');`)
  ));
  assert.equal(attempts.filter(r=>r.code===0).length,1,
    'Exactly one concurrent username claim must succeed');
  assert.equal(attempts.filter(r=>r.code!==0).length,1,
    'The losing claim must be rejected by the UNIQUE index');
  assert.match(attempts.find(r=>r.code!==0).stderr,/duplicate key|unique constraint/i);

  const verify=await psql(`
    SELECT
      (SELECT COUNT(*) FROM public.iydu_usernames
       WHERE lower(username)='racename')::text || ',' ||
      (SELECT COUNT(*) FROM public.profiles
       WHERE lower(username)='racename')::text || ',' ||
      (SELECT COUNT(*) FROM public.user_data
       WHERE lower(data->>'u')='racename')::text;`);
  assert.equal(verify.code,0,verify.stderr);
  assert.equal(verify.stdout.trim(),'1,1,1',
    'Reservation, profile, and JSON must commit together for the winner');
  process.stdout.write('Concurrent claim test passed on disposable PostgreSQL.\\n');
}
main().catch(error=>{process.stderr.write(String(error.stack||error)+'\\n');process.exitCode=1});
