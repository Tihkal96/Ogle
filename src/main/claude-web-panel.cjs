'use strict';
const {ChatGPTPanel}=require('./chatgpt-panel.cjs');
const {ClaudeWebActivity}=require('./claude-web-activity.cjs');
const CLAUDE_SITE=Object.freeze({home:'https://claude.ai/new',origin:'https://claude.ai',host:'claude.ai',label:'Claude',partition:'persist:ogle-claude-web',preload:'claude-web-view-preload.cjs',wheelChannel:'ogle:claude-web-wheel-zoom',Activity:ClaudeWebActivity,conversationPath:/^\/chat\/[a-zA-Z0-9-]+$/});
class ClaudeWebPanel extends ChatGPTPanel {constructor(options={}){super({...options,site:CLAUDE_SITE});}}
module.exports={ClaudeWebPanel,CLAUDE_SITE};
