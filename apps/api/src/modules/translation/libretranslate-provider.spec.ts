import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ConfigService } from '@nestjs/config';
import { LibreTranslateProvider, TRANSLATION_RESPONSE_MAX_BYTES } from './libretranslate-provider';
import { translationEnvironment } from './translation-config';
import type { AppEnvironment } from '../../config/environment';
describe('LibreTranslate contrato HTTP controlado', () => {
  let server: Server, url: string;
  let status = 200, value: unknown = { translatedText:'Hola', detectedLanguage:{ language:'en', confidence:100 } }, raw: string | undefined, slow = false, stalledBody = false;
  let payload: unknown, headers: unknown;
  beforeEach(async () => {
    status=200;raw=undefined;slow=false;stalledBody=false;value={translatedText:'Hola',detectedLanguage:{language:'en',confidence:100}};
    server=createServer((req,res) => { let body='';req.on('data',chunk => body+=String(chunk));req.on('end',()=>{
      payload=JSON.parse(body);headers=req.headers;
      if (slow) return;
      res.writeHead(status,{'Content-Type':'application/json',...(status===302?{Location:url+'/other'}:{})});
      if(stalledBody){res.write('{');return;}res.end(raw ?? JSON.stringify(value));
    }); });
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));url='http://127.0.0.1:'+(server.address() as AddressInfo).port;
  });
  afterEach(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
  const input={text:'Hello',sourceLanguage:'auto',targetLanguage:'es'} as const;
  function provider(extra:Record<string,unknown>={}) { return new LibreTranslateProvider(new ConfigService<AppEnvironment,true>(translationEnvironment({TRANSLATION_ENABLED:true,LIBRETRANSLATE_URL:url,...extra}))); }
  it('envía contrato real mínimo, sin identidad, y conserva idioma detectado',async()=>{
    expect(await provider().translate(input)).toEqual({translatedText:'Hola',detectedSourceLanguage:'en'});
    expect(payload).toEqual({q:'Hello',source:'auto',target:'es',format:'text'});
    expect(headers).not.toHaveProperty('cookie');expect(headers).not.toHaveProperty('authorization');
  });
  it('API key opcional solo en payload al proveedor',async()=>{await provider({LIBRETRANSLATE_API_KEY:'synthetic-test-key'}).translate(input);expect(payload).toHaveProperty('api_key','synthetic-test-key');});
  it.each([500,429,403,400])('rechaza HTTP %s sin filtrar body',async code=>{status=code;value={error:'private host details'};await expect(provider().translate(input)).rejects.toMatchObject({code:'TRANSLATION_PROVIDER_ERROR',message:'TRANSLATION_PROVIDER_ERROR'});});
  it.each([{},null,{translatedText:''},{translatedText:'   '},{translatedText:['Hola']},{translatedText:12},{translatedText:'\0'}])('rechaza respuesta inválida %j',async response=>{value=response;await expect(provider().translate(input)).rejects.toMatchObject({code:'TRANSLATION_PROVIDER_ERROR'});});
  it('rechaza JSON inválido',async()=>{raw='not JSON';await expect(provider().translate(input)).rejects.toMatchObject({code:'TRANSLATION_PROVIDER_ERROR'});});
  it('timeout aborta espera y permite otro intento',async()=>{slow=true;await expect(provider({TRANSLATION_TIMEOUT_MS:100}).translate(input)).rejects.toMatchObject({code:'TRANSLATION_TIMEOUT'});slow=false;expect((await provider().translate(input)).translatedText).toBe('Hola');});
  it('timeout también limita lectura de body incompleto',async()=>{stalledBody=true;await expect(provider({TRANSLATION_TIMEOUT_MS:100}).translate(input)).rejects.toMatchObject({code:'TRANSLATION_TIMEOUT'});});
  it('red inaccesible devuelve error seguro',async()=>{url='http://127.0.0.1:1';await expect(provider().translate(input)).rejects.toMatchObject({code:'TRANSLATION_PROVIDER_ERROR',message:'TRANSLATION_PROVIDER_ERROR'});});
  it('metadata no crítica inválida no invalida traducción útil',async()=>{value={translatedText:'Hola',detectedLanguage:{language:'x'.repeat(100)}};expect(await provider().translate(input)).toEqual({translatedText:'Hola',detectedSourceLanguage:undefined});});
  it('rechaza redirecciones sin seguir otro destino',async()=>{status=302;await expect(provider().translate(input)).rejects.toMatchObject({code:'TRANSLATION_PROVIDER_ERROR'});});
  it('rechaza respuesta excesiva',async()=>{raw='x'.repeat(TRANSLATION_RESPONSE_MAX_BYTES+1);await expect(provider().translate(input)).rejects.toMatchObject({code:'TRANSLATION_PROVIDER_ERROR'});});
  it('deshabilitado no hace llamadas',async()=>{await expect(provider({TRANSLATION_ENABLED:false}).translate(input)).rejects.toMatchObject({code:'TRANSLATION_UNAVAILABLE'});});
  it('body vacío no llama proveedor',async()=>{await expect(provider().translate({...input,text:' \n'})).rejects.toMatchObject({code:'TRANSLATION_EMPTY_BODY'});});
  it('admite todo el límite de entrada del dominio sin truncar',async()=>{await provider().translate({...input,text:'a'.repeat(200000)});expect(payload).toHaveProperty('q','a'.repeat(200000));});
});
describe('Configuración opcional de traducción',()=>{
  it('defaults seguros y sin red',()=>{expect(translationEnvironment({})).toMatchObject({TRANSLATION_ENABLED:false,TRANSLATION_TIMEOUT_MS:10000});});
  it.each(['invalid','ftp://localhost','http://user:secret@localhost','https://localhost?q=x','https://localhost/#fragment'])('URL %s no bloquea bootstrap y deshabilita',url=>{expect(translationEnvironment({TRANSLATION_ENABLED:true,LIBRETRANSLATE_URL:url}).TRANSLATION_ENABLED).toBe(false);});
  it.each(['0','-1','60001','abc',true])('timeout inválido %s deshabilita',timeout=>{expect(translationEnvironment({TRANSLATION_ENABLED:true,LIBRETRANSLATE_URL:'http://localhost:5000',TRANSLATION_TIMEOUT_MS:timeout}).TRANSLATION_ENABLED).toBe(false);});
});
