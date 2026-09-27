var canvas, stage, exportRoot, anim_container, dom_overlay_container, fnStartAnimation;
function init() 
{
	canvas = document.getElementById("canvas");
	anim_container = document.getElementById("animation_container");
	dom_overlay_container = document.getElementById("dom_overlay_container");
	var comp=AdobeAn.getComposition("3DEE92959FAAE94EA6CD02624033E47F");
	var lib=comp.getLibrary();
	var loader = new createjs.LoadQueue(false);
	loader.addEventListener("fileload", function(evt){handleFileLoad(evt,comp)});
	loader.addEventListener("complete", function(evt){handleComplete(evt,comp)});
	var lib=comp.getLibrary();
	loader.loadManifest(lib.properties.manifest);
}

function handleFileLoad(evt, comp) 
{
	var images=comp.getImages();	
	if (evt && (evt.item.type == "image")) { images[evt.item.id] = evt.result; }	
}

function handleComplete(evt,comp) 
{
	//This function is always called, irrespective of the content. You can use the variable "stage" after it is created in token create_stage.
	var lib=comp.getLibrary();
	var ss=comp.getSpriteSheet();
	var queue = evt.target;
	var ssMetadata = lib.ssMetadata;
	for(i=0; i<ssMetadata.length; i++) 
	{
		ss[ssMetadata[i].name] = new createjs.SpriteSheet( {"images": [queue.getResult(ssMetadata[i].name)], "frames": ssMetadata[i].frames} )
	}
	exportRoot = new lib.mainpage();
	stage = new lib.Stage(canvas);	
	//Registers the "tick" event listener.
	fnStartAnimation = function() 
	{
		stage.addChild(exportRoot);
		createjs.Ticker.framerate = lib.properties.fps;
		createjs.Ticker.addEventListener("tick", stage);
	}	    
	//Code to support hidpi screens and responsive scaling.
	AdobeAn.makeResponsive(true,'both',true,1,[canvas,anim_container,dom_overlay_container]);	
	AdobeAn.compositionLoaded(lib.properties.id);
	fnStartAnimation();
}




(function (cjs, an) 
{

var p; // shortcut to reference prototypes
var lib={};var ss={};var img={};
var rect; // used to reference frame bounds
lib.ssMetadata = [
		{name:"index_atlas_1", frames: [[616,638,308,108],[1449,703,108,108],[1559,703,108,108],[1569,0,108,108],[1569,110,108,108],[0,0,521,126],[523,0,521,126],[1046,0,521,126],[0,128,521,126],[523,128,521,126],[1046,128,521,126],[0,256,521,126],[523,256,521,126],[1046,256,521,126],[0,384,521,125],[523,384,521,125],[1046,384,521,125],[0,511,521,125],[523,511,521,125],[1046,511,521,110],[1046,623,521,78],[0,638,614,56],[0,696,614,40],[0,738,521,34],[926,703,521,34],[523,748,614,8],[523,758,614,8]]}
];


(lib.AnMovieClip = function()
{
	this.actionFrames = [];
	this.ignorePause = false;
	this.gotoAndPlay = function(positionOrLabel)
	{
		cjs.MovieClip.prototype.gotoAndPlay.call(this,positionOrLabel);
	}
	this.play = function()
	{
		cjs.MovieClip.prototype.play.call(this);
	}
	this.gotoAndStop = function(positionOrLabel)
	{
		cjs.MovieClip.prototype.gotoAndStop.call(this,positionOrLabel);
	}
	this.stop = function()
	{
		cjs.MovieClip.prototype.stop.call(this);
	}
}).prototype = p = new cjs.MovieClip();
// symbols:



(lib.CachedBmp_27 = function() 
{
	this.initialize(ss["index_atlas_1"]);
	this.gotoAndStop(0);
}).prototype = p = new cjs.Sprite();



(lib.CachedBmp_26 = function() 
{
	this.initialize(ss["index_atlas_1"]);
	this.gotoAndStop(1);
}).prototype = p = new cjs.Sprite();



(lib.CachedBmp_25 = function() 
{
	this.initialize(ss["index_atlas_1"]);
	this.gotoAndStop(2);
}).prototype = p = new cjs.Sprite();



(lib.CachedBmp_24 = function() 
{
	this.initialize(ss["index_atlas_1"]);
	this.gotoAndStop(3);
}).prototype = p = new cjs.Sprite();



(lib.CachedBmp_23 = function() 
{
	this.initialize(ss["index_atlas_1"]);
	this.gotoAndStop(4);
}).prototype = p = new cjs.Sprite();



(lib.CachedBmp_22 = function() 
{
	this.initialize(ss["index_atlas_1"]);
	this.gotoAndStop(5);
}).prototype = p = new cjs.Sprite();



(lib.CachedBmp_21 = function() 
{
	this.initialize(ss["index_atlas_1"]);
	this.gotoAndStop(6);
}).prototype = p = new cjs.Sprite();



(lib.CachedBmp_20 = function() 
{
	this.initialize(ss["index_atlas_1"]);
	this.gotoAndStop(7);
}).prototype = p = new cjs.Sprite();



(lib.CachedBmp_19 = function() 
{
	this.initialize(ss["index_atlas_1"]);
	this.gotoAndStop(8);
}).prototype = p = new cjs.Sprite();



(lib.CachedBmp_18 = function()
{
	this.initialize(ss["index_atlas_1"]);
	this.gotoAndStop(9);
}).prototype = p = new cjs.Sprite();



(lib.CachedBmp_17 = function() 
{
	this.initialize(ss["index_atlas_1"]);
	this.gotoAndStop(10);
}).prototype = p = new cjs.Sprite();



(lib.CachedBmp_16 = function() 
{
	this.initialize(ss["index_atlas_1"]);
	this.gotoAndStop(11);
}).prototype = p = new cjs.Sprite();



(lib.CachedBmp_15 = function() 
{
	this.initialize(ss["index_atlas_1"]);
	this.gotoAndStop(12);
}).prototype = p = new cjs.Sprite();



(lib.CachedBmp_14 = function() 
{
	this.initialize(ss["index_atlas_1"]);
	this.gotoAndStop(13);
}).prototype = p = new cjs.Sprite();



(lib.CachedBmp_13 = function() 
{
	this.initialize(ss["index_atlas_1"]);
	this.gotoAndStop(14);
}).prototype = p = new cjs.Sprite();



(lib.CachedBmp_12 = function() 
{
	this.initialize(ss["index_atlas_1"]);
	this.gotoAndStop(15);
}).prototype = p = new cjs.Sprite();



(lib.CachedBmp_11 = function() 
{
	this.initialize(ss["index_atlas_1"]);
	this.gotoAndStop(16);
}).prototype = p = new cjs.Sprite();



(lib.CachedBmp_10 = function() 
{
	this.initialize(ss["index_atlas_1"]);
	this.gotoAndStop(17);
}).prototype = p = new cjs.Sprite();



(lib.CachedBmp_9 = function() 
{
	this.initialize(ss["index_atlas_1"]);
	this.gotoAndStop(18);
}).prototype = p = new cjs.Sprite();



(lib.CachedBmp_8 = function() 
{
	this.initialize(ss["index_atlas_1"]);
	this.gotoAndStop(19);
}).prototype = p = new cjs.Sprite();



(lib.CachedBmp_7 = function() 
{
	this.initialize(ss["index_atlas_1"]);
	this.gotoAndStop(20);
}).prototype = p = new cjs.Sprite();



(lib.CachedBmp_6 = function() 
{
	this.initialize(ss["index_atlas_1"]);
	this.gotoAndStop(21);
}).prototype = p = new cjs.Sprite();



(lib.CachedBmp_5 = function() 
{
	this.initialize(ss["index_atlas_1"]);
	this.gotoAndStop(22);
}).prototype = p = new cjs.Sprite();



(lib.CachedBmp_4 = function() 
{
	this.initialize(ss["index_atlas_1"]);
	this.gotoAndStop(23);
}).prototype = p = new cjs.Sprite();



(lib.CachedBmp_3 = function() 
{
	this.initialize(ss["index_atlas_1"]);
	this.gotoAndStop(24);
}).prototype = p = new cjs.Sprite();



(lib.CachedBmp_2 = function() 
{
	this.initialize(ss["index_atlas_1"]);
	this.gotoAndStop(25);
}).prototype = p = new cjs.Sprite();



(lib.CachedBmp_1 = function() 
{
	this.initialize(ss["index_atlas_1"]);
	this.gotoAndStop(26);
}).prototype = p = new cjs.Sprite();
// helper functions:

function mc_symbol_clone() 
{
	var clone = this._cloneProps(new this.constructor(this.mode, this.startPosition, this.loop, this.reversed));
	clone.gotoAndStop(this.currentFrame);
	clone.paused = this.paused;
	clone.framerate = this.framerate;
	return clone;
}

function getMCSymbolPrototype(symbol, nominalBounds, frameBounds) 
{
	var prototype = cjs.extend(symbol, cjs.MovieClip);
	prototype.clone = mc_symbol_clone;
	prototype.nominalBounds = nominalBounds;
	prototype.frameBounds = frameBounds;
	return prototype;
	}


(lib.Symbol5 = function(mode,startPosition,loop,reversed) 
{
if (loop == null) { loop = true; }
if (reversed == null) { reversed = false; }
	var props = new Object();
	props.mode = mode;
	props.startPosition = startPosition;
	props.labels = {};
	props.loop = loop;
	props.reversed = reversed;
	cjs.MovieClip.apply(this,[props]);

	// Layer_1
	this.shape = new cjs.Shape();
	this.shape.graphics.f("#FF1609").s().p("EgAIAgmQgog9gUhQIg9j/Igli1QgPhHgGgfIAAgEQgQhkAAhYIgBmgIg09rIgBgBIhzgJQgVAFgQAFQgng1g/giQgPgggOgYIgSgfQgJgQANAcIgMgVQAMgGAKgCIA1AAQBoAGBTADIAoACIB0AEIA8goIALh6IAAiyQgEgkAEg0QABgWgBiYQgCiagDgVQgLhXgOgxQAAgJANgHIAsgXIAYgQQASgLAIAAQAOABAlAaIAsAXQAMAHAAAJQgNAxgLBXQgDAVgCCaQgBCXABAXQAEAygEAmIAACyIALB6IA8AoIBzgEIAogCQBUgDBogGIA1AAQAKACAMAGIgMAUQANgbgJAQIgSAfQgPAYgOAgQg+AhgoA2QgPgFgWgFIh0AJIAAABIg0drIgBGgQAABagQBiIgBAEQgFAfgQBHIglC1QgfCKgdB1QgSBJgqBEIgJAKg");
	this.shape.setTransform(26.0484,83.5317,0.4596,0.3985);

	this.timeline.addTween(cjs.Tween.get(this.shape).wait(1));

	this._renderFirstFrame();

}).prototype = p = new cjs.MovieClip();
p.nominalBounds = rect = new cjs.Rectangle(0,0,52.1,167.1);
p.frameBounds = [rect];


(lib.Symbol4 = function(mode,startPosition,loop,reversed) 
{
if (loop == null) { loop = true; }
if (reversed == null) { reversed = false; }
	var props = new Object();
	props.mode = mode;
	props.startPosition = startPosition;
	props.labels = {};
	props.loop = loop;
	props.reversed = reversed;
	cjs.MovieClip.apply(this,[props]);

	// Layer_1
	this.shape = new cjs.Shape();
	this.shape.graphics.f("#FF1609").s().p("EgAIAgmQgog9gUhQIg9j/Igli1QgPhHgGgfIAAgEQgQhkAAhYIgBmgIg09rIgBgBIhzgJQgVAFgQAFQgng1g/giQgPgggOgYIgSgfQgJgQANAcIgMgVQAMgGAKgCIA1AAQBoAGBTADIAoACIB0AEIA8goIALh6IAAiyQgEgkAEg0QABgWgBiYQgCiagDgVQgLhXgOgxQAAgJANgHIAsgXIAYgQQASgLAIAAQAOABAlAaIAsAXQAMAHAAAJQgNAxgLBXQgDAVgCCaQgBCXABAXQAEAygEAmIAACyIALB6IA8AoIBzgEIAogCQBUgDBogGIA1AAQAKACAMAGIgMAUQANgbgJAQIgSAfQgPAYgOAgQg+AhgoA2QgPgFgWgFIh0AJIAAABIg0drIgBGgQAABagQBiIgBAEQgFAfgQBHIglC1QgfCKgdB1QgSBJgqBEIgJAKg");
	this.shape.setTransform(26.0484,83.5317,0.4596,0.3985);

	this.timeline.addTween(cjs.Tween.get(this.shape).wait(1));

	this._renderFirstFrame();

}).prototype = p = new cjs.MovieClip();
p.nominalBounds = rect = new cjs.Rectangle(0,0,52.1,167.1);
p.frameBounds = [rect];


(lib.Symbol3 = function(mode,startPosition,loop,reversed) 
{
if (loop == null) { loop = true; }
if (reversed == null) { reversed = false; }
	var props = new Object();
	props.mode = mode;
	props.startPosition = startPosition;
	props.labels = {};
	props.loop = loop;
	props.reversed = reversed;
	cjs.MovieClip.apply(this,[props]);

	// Layer_1
	this.shape = new cjs.Shape();
	this.shape.graphics.f("#FF1609").s().p("EgAIAgmQgog9gUhQIg9j/Igli1QgPhHgGgfIAAgEQgQhkAAhYIgBmgIg09rIgBgBIhzgJQgVAFgQAFQgng1g/giQgPgggOgYIgSgfQgJgQANAcIgMgVQAMgGAKgCIA1AAQBoAGBTADIAoACIB0AEIA8goIALh6IAAiyQgEgkAEg0QABgWgBiYQgCiagDgVQgLhXgOgxQAAgJANgHIAsgXIAYgQQASgLAIAAQAOABAlAaIAsAXQAMAHAAAJQgNAxgLBXQgDAVgCCaQgBCXABAXQAEAygEAmIAACyIALB6IA8AoIBzgEIAogCQBUgDBogGIA1AAQAKACAMAGIgMAUQANgbgJAQIgSAfQgPAYgOAgQg+AhgoA2QgPgFgWgFIh0AJIAAABIg0drIgBGgQAABagQBiIgBAEQgFAfgQBHIglC1QgfCKgdB1QgSBJgqBEIgJAKg");
	this.shape.setTransform(26.0484,83.5317,0.4596,0.3985);

	this.timeline.addTween(cjs.Tween.get(this.shape).wait(1));

	this._renderFirstFrame();

}).prototype = p = new cjs.MovieClip();
p.nominalBounds = rect = new cjs.Rectangle(0,0,52.1,167.1);
p.frameBounds = [rect];


(lib.Group = function(mode,startPosition,loop,reversed) 
{
if (loop == null) { loop = true; }
if (reversed == null) { reversed = false; }
	var props = new Object();
	props.mode = mode;
	props.startPosition = startPosition;
	props.labels = {};
	props.loop = loop;
	props.reversed = reversed;
	cjs.MovieClip.apply(this,[props]);

	// Layer_1
	this.instance = new lib.CachedBmp_27();
	this.instance.setTransform(186.95,-7.15,0.5,0.5);

	this.instance_1 = new lib.CachedBmp_26();
	this.instance_1.setTransform(134.2,-7.15,0.5,0.5);

	this.instance_2 = new lib.CachedBmp_25();
	this.instance_2.setTransform(95,-7.15,0.5,0.5);

	this.instance_3 = new lib.CachedBmp_24();
	this.instance_3.setTransform(53,-7.15,0.5,0.5);

	this.instance_4 = new lib.CachedBmp_23();
	this.instance_4.setTransform(-2,-7.15,0.5,0.5);

	this.timeline.addTween(cjs.Tween.get({}).to({state:[{t:this.instance_4},{t:this.instance_3},{t:this.instance_2},{t:this.instance_1},{t:this.instance}]}).wait(1));

	this._renderFirstFrame();

}).prototype = getMCSymbolPrototype(lib.Group, rect = new cjs.Rectangle(-2,-7.1,343,54), [rect]);


(lib.Symbol2 = function(mode,startPosition,loop,reversed) 
{
if (loop == null) { loop = true; }
if (reversed == null) { reversed = false; }
	var props = new Object();
	props.mode = mode;
	props.startPosition = startPosition;
	props.labels = {};
	props.loop = loop;
	props.reversed = reversed;
	cjs.MovieClip.apply(this,[props]);

	// Layer_1
	this.instance = new lib.Group();
	this.instance.setTransform(91.6,11.9,0.5337,0.4405,0,0,0,169.7,20);

	this.timeline.addTween(cjs.Tween.get(this.instance).wait(1));

	this._renderFirstFrame();

}).prototype = p = new cjs.MovieClip();
p.nominalBounds = rect = new cjs.Rectangle(0,0,183,23.8);
p.frameBounds = [rect];


// stage content:
(lib.mainpage = function(mode,startPosition,loop,reversed) 
{
if (loop == null) { loop = false; }
if (reversed == null) { reversed = false; }
	var props = new Object();
	props.mode = mode;
	props.startPosition = startPosition;
	props.labels = {};
	props.loop = loop;
	props.reversed = reversed;
	cjs.MovieClip.apply(this,[props]);

	// Layer_2
	this.instance = new lib.Symbol2("synched",0);
	this.instance.setTransform(225.9,170.35,1,1,0,0,0,91.5,11.8);
	this.instance.alpha = 0;
	this.instance._off = true;

	this.timeline.addTween(cjs.Tween.get(this.instance).wait(32).to({_off:false},0).wait(1).to({alpha:0.1484},0).wait(1).to({alpha:0.3008},0).wait(1).to({alpha:0.4492},0).wait(1).to({alpha:0.6016},0).wait(1).to({alpha:0.75},0).wait(1).to({alpha:0.8984},0).wait(1).to({alpha:1},0).wait(2));

	// Layer_2
	this.instance_1 = new lib.Symbol3("synched",0);
	this.instance_1.setTransform(118.4,-103.5,1,1,0,0,0,26.1,83.5);
	this.instance_1.alpha = 0.1016;

	this.instance_2 = new lib.Symbol4("synched",0);
	this.instance_2.setTransform(118.4,-83.5,1,1,0,0,0,26.1,83.5);
	this.instance_2.alpha = 0.1992;

	this.instance_3 = new lib.Symbol5("synched",0);
	this.instance_3.setTransform(118.4,-63.5,1,1,0,0,0,26.1,83.5);
	this.instance_3.alpha = 0.2891;

	this.shape = new cjs.Shape();
	this.shape.graphics.f("#FF1609").s().p("EgAIAgmQgog9gUhQIg9j/Igli1QgPhHgGgfIAAgEQgQhkAAhYIgBmgIg09rIgBgBIhzgJQgVAFgQAFQgng1g/giQgPgggOgYIgSgfQgJgQANAcIgMgVQAMgGAKgCIA1AAQBoAGBTADIAoACIB0AEIA8goIALh6IAAiyQgEgkAEg0QABgWgBiYQgCiagDgVQgLhXgOgxQAAgJANgHIAsgXIAYgQQASgLAIAAQAOABAlAaIAsAXQAMAHAAAJQgNAxgLBXQgDAVgCCaQgBCXABAXQAEAygEAmIAACyIALB6IA8AoIBzgEIAogCQBUgDBogGIA1AAQAKACAMAGIgMAUQANgbgJAQIgSAfQgPAYgOAgQg+AhgoA2QgPgFgWgFIh0AJIAAABIg0drIgBGgQAABagQBiIgBAEQgFAfgQBHIglC1QgfCKgdB1QgSBJgqBEIgJAKg");
	this.shape.setTransform(118.3449,-43.4811,0.4595,0.3985);
	this.shape._off = true;

	this.timeline.addTween(cjs.Tween.get({}).to({state:[]}).to({state:[{t:this.instance_1}]},21).to({state:[{t:this.instance_2}]},1).to({state:[{t:this.instance_3}]},1).to({state:[{t:this.shape}]},1).to({state:[{t:this.shape}]},1).to({state:[{t:this.shape}]},1).to({state:[{t:this.shape}]},1).to({state:[{t:this.shape}]},1).to({state:[{t:this.shape}]},1).to({state:[{t:this.shape}]},1).to({state:[{t:this.shape}]},1).to({state:[{t:this.shape}]},1).to({state:[{t:this.shape}]},3).to({state:[{t:this.shape}]},1).to({state:[{t:this.shape}]},1).wait(4));
	this.timeline.addTween(cjs.Tween.get(this.shape).wait(24).to({_off:false},0).wait(1).to({y:-23.4811},0).wait(1).to({y:-3.4811},0).wait(1).to({y:16.5189},0).wait(1).to({y:36.5189},0).wait(1).to({y:58.1189},0).wait(1).to({y:78.1189},0).wait(1).to({y:98.1189},0).wait(1).to({y:114.1189},0).wait(3).to({x:118.3432,y:114.1157},0).wait(2).to({x:118.3449,y:114.1189},0).wait(4));

	// kana_svg
	this.instance_4 = new lib.CachedBmp_1();
	this.instance_4.setTransform(19.65,143.15,0.5,0.5);

	this.instance_5 = new lib.CachedBmp_2();
	this.instance_5.setTransform(19.65,141.05,0.5,0.5);

	this.instance_6 = new lib.CachedBmp_3();
	this.instance_6.setTransform(57.3,130.05,0.5,0.5);

	this.instance_7 = new lib.CachedBmp_4();
	this.instance_7.setTransform(57.3,130.05,0.5,0.5);

	this.instance_8 = new lib.CachedBmp_5();
	this.instance_8.setTransform(34.6,126.25,0.5,0.5);

	this.instance_9 = new lib.CachedBmp_6();
	this.instance_9.setTransform(34.55,118.95,0.5,0.5);

	this.instance_10 = new lib.CachedBmp_7();
	this.instance_10.setTransform(57.3,106.55,0.5,0.5);

	this.instance_11 = new lib.CachedBmp_8();
	this.instance_11.setTransform(57.3,94.55,0.5,0.5);

	this.instance_12 = new lib.CachedBmp_9();
	this.instance_12.setTransform(57.3,86.55,0.5,0.5);

	this.instance_13 = new lib.CachedBmp_10();
	this.instance_13.setTransform(57.3,80.95,0.5,0.5);

	this.instance_14 = new lib.CachedBmp_11();
	this.instance_14.setTransform(57.3,76.15,0.5,0.5);

	// FIX: instances 15/16 originally used atlas cells 15/14 (a 125px-tall
	// rasterization placed at y=74.55). The nine frames that follow use a
	// 126px-tall rasterization of the same artwork at y=74.5, so the
	// lettering visibly dropped ~0.5px at the switch. Use the final-frame
	// bitmap and transform for the hold frames so the logo doesn't move.
	this.instance_15 = new lib.CachedBmp_14();
	this.instance_15.setTransform(57.3,74.5,0.5,0.5);

	this.instance_16 = new lib.CachedBmp_14();
	this.instance_16.setTransform(57.3,74.5,0.5,0.5);

	this.instance_17 = new lib.CachedBmp_14();
	this.instance_17.setTransform(57.3,74.5,0.5,0.5);

	this.instance_18 = new lib.CachedBmp_15();
	this.instance_18.setTransform(57.3,74.5,0.5,0.5);

	this.instance_19 = new lib.CachedBmp_16();
	this.instance_19.setTransform(57.3,74.5,0.5,0.5);

	this.instance_20 = new lib.CachedBmp_17();
	this.instance_20.setTransform(57.3,74.5,0.5,0.5);

	this.instance_21 = new lib.CachedBmp_18();
	this.instance_21.setTransform(57.3,74.5,0.5,0.5);

	this.instance_22 = new lib.CachedBmp_19();
	this.instance_22.setTransform(57.3,74.5,0.5,0.5);

	this.instance_23 = new lib.CachedBmp_20();
	this.instance_23.setTransform(57.3,74.5,0.5,0.5);

	this.instance_24 = new lib.CachedBmp_21();
	this.instance_24.setTransform(57.3,74.5,0.5,0.5);

	this.instance_25 = new lib.CachedBmp_22();
	this.instance_25.setTransform(57.3,74.5,0.5,0.5);

	this.timeline.addTween(cjs.Tween.get({}).to({state:[]}).to({state:[{t:this.instance_4}]},10).to({state:[{t:this.instance_5}]},1).to({state:[{t:this.instance_6}]},1).to({state:[{t:this.instance_7}]},1).to({state:[{t:this.instance_8}]},1).to({state:[{t:this.instance_9}]},1).to({state:[{t:this.instance_10}]},1).to({state:[{t:this.instance_11}]},1).to({state:[{t:this.instance_12}]},1).to({state:[{t:this.instance_13}]},1).to({state:[{t:this.instance_14}]},1).to({state:[{t:this.instance_15}]},1).to({state:[{t:this.instance_16}]},10).to({state:[{t:this.instance_17}]},1).to({state:[{t:this.instance_18}]},1).to({state:[{t:this.instance_19}]},1).to({state:[{t:this.instance_20}]},1).to({state:[{t:this.instance_21}]},1).to({state:[{t:this.instance_22}]},1).to({state:[{t:this.instance_23}]},1).to({state:[{t:this.instance_24}]},1).to({state:[{t:this.instance_25}]},1).wait(1));

	// logo_svg
	this.shape_1 = new cjs.Shape();
	this.shape_1.graphics.f("#FF1609").s().p("AgcAeIAAg7IA5AAIAAA7g");
	this.shape_1.setTransform(187.5,141.9);

	this.shape_2 = new cjs.Shape();
	this.shape_2.graphics.f("#FF1609").s().p("AgwAeIAAg7IAKAAIAAAAIBNAAIAAAAIAKAAIAAA7g");
	this.shape_2.setTransform(187.5,141.925);

	this.shape_3 = new cjs.Shape();
	this.shape_3.graphics.f("#FF1609").s().p("AhGAeIAAg7IAOAAIAAAAIBxAAIAAAAIAPAAIAAA7g");
	this.shape_3.setTransform(187.5,141.925);

	this.shape_4 = new cjs.Shape();
	this.shape_4.graphics.f("#FF1609").s().p("AhkAeIAAg7IAVAAIAAAAICgAAIAAAAIAUAAIAAA7g");
	this.shape_4.setTransform(187.5,141.925);

	this.shape_5 = new cjs.Shape();
	this.shape_5.graphics.f("#FF1609").s().p("AiwAeIAAg7IAkAAIAAAAIEbAAIAAAAIAiAAIAAA7g");
	this.shape_5.setTransform(187.525,141.925);

	this.shape_6 = new cjs.Shape();
	this.shape_6.graphics.f("#FF1609").s().p("AkFAeIAAg7IA1AAIAAAAIGjAAIAAAAIAzAAIAAA7g");
	this.shape_6.setTransform(187.5,141.925);

	this.shape_7 = new cjs.Shape();
	this.shape_7.graphics.f("#FF1609").s().p("AkFAeIAAAAIiVAAIAAg7IBTAAIAAgBIKSAAIAAABIBPAAIAAA7IiUAAIAAAAg");
	this.shape_7.setTransform(187.5,141.95);

	this.shape_8 = new cjs.Shape();
	this.shape_8.graphics.f("#FF1609").s().p("AkFAfIAAgBIiVAAIAAAAIjEAAIAAg7IB7AAIAAgBIPLAAIAAABIB2AAIAAA7IjEAAIAAAAIiUAAIAAABg");
	this.shape_8.setTransform(187.5,141.975);

	this.shape_9 = new cjs.Shape();
	this.shape_9.graphics.f("#FF1609").s().p("AkFAfIAAgBIkhAAIAAAAIk4AAIAAg7ICuAAIAAgBIVnAAIAAABICpAAIAAA7Ik5AAIAAAAIkhAAIAAABg");
	this.shape_9.setTransform(187.5,141.975);

	this.shape_10 = new cjs.Shape();
	this.shape_10.graphics.f("#FF1609").s().p("AnRAfIAAgBIoCAAIAAAAIorAAIAAg7IE2AAIAAgBMAmbAAAIAAABIEsAAIAAA7IosAAIAAAAIoCAAIAAABg");
	this.shape_10.setTransform(187.525,141.975);

	this.shape_11 = new cjs.Shape();
	this.shape_11.graphics.f("#FF1609").s().dr(-187.4,-6.2,374.9,12.5); // flattened: the exported path had 0.1-0.2px steps that showed as 1px lines at some zoom levels
	this.shape_11.setTransform(187.5,145.2);

	this.shape_12 = new cjs.Shape();
	this.shape_12.graphics.f("#FF1609").s().dr(-187.4,-6.2,374.9,12.5); // flattened: see shape_11 note
	this.shape_12.setTransform(187.5,145.2);
	this.shape_12._off = true;

	this.shape_13 = new cjs.Shape();
	this.shape_13.graphics.f("#FF1609").s().p("AqCA/IAAgBIpQAAIAAgBIqAAAIAAh5IFlAAIAAgCMAvIAAAIAAACIF4AAIAAB5IpUAAIAAABIqGAAIAAABg");
	this.shape_13.setTransform(187.5,145.2);

	this.timeline.addTween(cjs.Tween.get({}).to({state:[{t:this.shape_1}]}).to({state:[{t:this.shape_2}]},1).to({state:[{t:this.shape_3}]},1).to({state:[{t:this.shape_4}]},1).to({state:[{t:this.shape_5}]},1).to({state:[{t:this.shape_6}]},1).to({state:[{t:this.shape_7}]},1).to({state:[{t:this.shape_8}]},1).to({state:[{t:this.shape_9}]},1).to({state:[{t:this.shape_10}]},1).to({state:[{t:this.shape_11}]},1).to({state:[{t:this.shape_12}]},1).to({state:[{t:this.shape_12}]},1).to({state:[{t:this.shape_12}]},1).to({state:[{t:this.shape_13}]},1).to({state:[{t:this.shape_12}]},1).to({state:[{t:this.shape_12}]},1).to({state:[{t:this.shape_12}]},1).to({state:[{t:this.shape_12}]},1).to({state:[{t:this.shape_12}]},1).to({state:[{t:this.shape_12}]},1).to({state:[{t:this.shape_12}]},1).to({state:[{t:this.shape_12}]},1).to({state:[{t:this.shape_12}]},1).to({state:[{t:this.shape_12}]},1).to({state:[{t:this.shape_12}]},1).to({state:[{t:this.shape_12}]},1).to({state:[{t:this.shape_12}]},1).to({state:[{t:this.shape_11}]},1).to({state:[{t:this.shape_12}]},1).to({state:[{t:this.shape_12}]},1).to({state:[{t:this.shape_12}]},1).to({state:[{t:this.shape_12}]},1).to({state:[{t:this.shape_12}]},1).to({state:[{t:this.shape_12}]},1).to({state:[{t:this.shape_12}]},1).to({state:[{t:this.shape_12}]},1).to({state:[{t:this.shape_12}]},1).to({state:[{t:this.shape_12}]},1).to({state:[{t:this.shape_12}]},1).to({state:[{t:this.shape_12}]},1).wait(1));
	this.timeline.addTween(cjs.Tween.get(this.shape_12).wait(11).to({_off:false},0).wait(2).to({_off:true},1).wait(1).to({_off:false},0).wait(12).to({_off:true},1).wait(1).to({_off:false},0).wait(12));

	this._renderFirstFrame();
	

}).prototype = p = new lib.AnMovieClip();
p.nominalBounds = rect = new cjs.Rectangle(372.1,330.9,5.9,6);
p.frameBounds = [rect, new cjs.Rectangle(370.1,330.9,9.8,6), new cjs.Rectangle(367.9,330.9,14.3,6), new cjs.Rectangle(364.9,330.9,20.2,6), new cjs.Rectangle(357.3,330.9,35.4,6), new cjs.Rectangle(348.8,330.9,52.4,6), new cjs.Rectangle(334,330.9,82.1,6.1), new cjs.Rectangle(314.4,330.9,121.3,6.2), new cjs.Rectangle(288.7,330.9,172.7,6.2), new cjs.Rectangle(221.6,330.9,307,6.2), rect=new cjs.Rectangle(187.5,330.9,375,12.6), rect, rect=new cjs.Rectangle(187.5,322.1,375,21.4), rect, new cjs.Rectangle(187.5,318.3,375,25.3), new cjs.Rectangle(187.5,311,375,32.6), new cjs.Rectangle(187.5,298.6,375,45), new cjs.Rectangle(187.5,286.6,375,57), new cjs.Rectangle(187.5,278.6,375,65), new cjs.Rectangle(187.5,273,375,70.6), new cjs.Rectangle(187.5,268.2,375,75.4), new cjs.Rectangle(187.5,5,375,338.5), new cjs.Rectangle(187.5,25,375,318.5), new cjs.Rectangle(187.5,45,375,298.5), new cjs.Rectangle(187.5,65,375,278.5), new cjs.Rectangle(187.5,85,375,258.5), new cjs.Rectangle(187.5,105,375,238.5), new cjs.Rectangle(187.5,125,375,218.5), new cjs.Rectangle(187.5,145,375,198.5), new cjs.Rectangle(187.5,166.6,375,176.9), new cjs.Rectangle(187.5,186.6,375,167.1), new cjs.Rectangle(187.5,206.6,375,167.1), rect=new cjs.Rectangle(187.5,222.6,375,167.1), rect, rect, rect, rect, rect, rect, rect, rect];
// library properties:
lib.properties = 
{
	id: '3DEE92959FAAE94EA6CD02624033E47F',
	width: 375,
	height: 384,
	fps: 30,
	color: "#FFFFFF",
	opacity: 0.00,
	manifest: [
		{src:"/images/index_atlas_1.png?v=6904123a", id:"index_atlas_1"}
	],
	preloads: []
};



// bootstrap callback support:

(lib.Stage = function(canvas) 
{
	createjs.Stage.call(this, canvas);
}).prototype = p = new createjs.Stage();

p.setAutoPlay = function(autoPlay) 
{
	this.tickEnabled = autoPlay;
}
p.play = function() { this.tickEnabled = true; this.getChildAt(0).gotoAndPlay(this.getTimelinePosition()) }
p.stop = function(ms) { if(ms) this.seek(ms); this.tickEnabled = false; }
p.seek = function(ms) { this.tickEnabled = true; this.getChildAt(0).gotoAndStop(lib.properties.fps * ms / 1000); }
p.getDuration = function() { return this.getChildAt(0).totalFrames / lib.properties.fps * 1000; }

p.getTimelinePosition = function() { return this.getChildAt(0).currentFrame / lib.properties.fps * 1000; }

an.bootcompsLoaded = an.bootcompsLoaded || [];
if(!an.bootstrapListeners) 
{
	an.bootstrapListeners=[];
}

an.bootstrapCallback=function(fnCallback) 
{
	an.bootstrapListeners.push(fnCallback);
	if(an.bootcompsLoaded.length > 0) {
		for(var i=0; i<an.bootcompsLoaded.length; ++i) 
		{
			fnCallback(an.bootcompsLoaded[i]);
		}
	}
};

an.compositions = an.compositions || {};
an.compositions['3DEE92959FAAE94EA6CD02624033E47F'] = 
{
	getStage: function() { return exportRoot.stage; },
	getLibrary: function() { return lib; },
	getSpriteSheet: function() { return ss; },
	getImages: function() { return img; }
};

an.compositionLoaded = function(id) 
{
	an.bootcompsLoaded.push(id);
	for(var j=0; j<an.bootstrapListeners.length; j++) 
	{
		an.bootstrapListeners[j](id);
	}
}

an.getComposition = function(id) 
{
	return an.compositions[id];
}


an.makeResponsive = function(isResp, respDim, isScale, scaleType, domContainers) 
{		
	var lastW, lastH, lastS=1;		
	window.addEventListener('resize', resizeCanvas);		
	resizeCanvas();		
	function resizeCanvas() 
	{			
		var w = lib.properties.width, h = lib.properties.height;			
		var iw = window.innerWidth, ih=window.innerHeight;			
		var pRatio = window.devicePixelRatio || 1, xRatio=iw/w, yRatio=ih/h, sRatio=1;			
		if(isResp) 
		{                
			if((respDim=='width'&&lastW==iw) || (respDim=='height'&&lastH==ih)) 
			{                    
				sRatio = lastS;                
			}				
			else if(!isScale) 
			{					
				if(iw<w || ih<h)						
					sRatio = Math.min(xRatio, yRatio);				
			}				
			else if(scaleType==1) 
			{					
				sRatio = Math.min(xRatio, yRatio);				
			}				
			else if(scaleType==2) 
			{					
				sRatio = Math.max(xRatio, yRatio);				
			}			
		}
		domContainers[0].width = w * pRatio * sRatio;			
		domContainers[0].height = h * pRatio * sRatio;
		domContainers.forEach(function(container) 
		{				
			container.style.width = w * sRatio + 'px';				
			container.style.height = h * sRatio + 'px';			
		});
		stage.scaleX = pRatio*sRatio;			
		stage.scaleY = pRatio*sRatio;
		lastW = iw; lastH = ih; lastS = sRatio;            
		stage.tickOnUpdate = false;            
		stage.update();            
		stage.tickOnUpdate = true;		
	}
}
an.handleSoundStreamOnTick = function(event) 
{
	if(!event.paused){
		var stageChild = stage.getChildAt(0);
		if(!stageChild.paused || stageChild.ignorePause)
		{
			stageChild.syncStreamSounds();
		}
	}
}
an.handleFilterCache = function(event) 
{
	if(!event.paused)
	{
		var target = event.target;
		if(target)
		{
			if(target.filterCacheList)
			{
				for(var index = 0; index < target.filterCacheList.length ; index++)
				{
					var cacheInst = target.filterCacheList[index];
					if((cacheInst.startFrame <= target.currentFrame) && (target.currentFrame <= cacheInst.endFrame)){
						cacheInst.instance.cache(cacheInst.x, cacheInst.y, cacheInst.w, cacheInst.h);
					}
				}
			}
		}
	}
}


})(createjs = createjs||{}, AdobeAn = AdobeAn||{});
var createjs, AdobeAn;

