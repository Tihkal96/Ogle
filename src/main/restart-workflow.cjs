'use strict';
// One installation/update transaction owns the input lock and helper commit.
class RestartWorkflow{
  constructor(operations){this.operations=operations;this.active=false;}
  async run(request){
    if(this.active)throw Error('An installation or update is already being prepared.');
    this.active=true;let handoff;
    try{
      await this.operations.validate(request);
      await this.operations.checkWork(false);
      await this.operations.lock(true);
      await this.operations.flush();
      await this.operations.checkWork(true);
      handoff=await this.operations.prepare(request);
      await this.operations.checkWork(true);
      if(!await this.operations.shutdownReady())throw Error('The workspace could not be saved. Ogle stayed open.');
      await this.operations.checkWork(true);
      await this.operations.commit(handoff);
      this.operations.quit();
      return{restarting:true};
    }catch(error){
      try{if(handoff)await this.operations.cancel(handoff);}catch(cancelError){error.cause=cancelError;}
      try{this.operations.invalidateShutdown();await this.operations.lock(false);}finally{this.active=false;}
      throw error;
    }
  }
}
module.exports={RestartWorkflow};
