import {createHandler} from './handler.mjs';
Deno.serve(createHandler({env:key=>Deno.env.get(key)}));
