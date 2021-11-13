
// ======================================================================================
// ======================================================================================
// ============= KFormViewer
// ======================================================================================
// ======================================================================================




function KFormViewer(viewport, master)
{
	/** The form viewer
	* @class 
	* @alias KFormViewer
	* @augments KPrototypeViewer
	*/
	var that = KPrototypeViewer(viewport, master);
	that.viewerType = 'formViewer';

	that.currentFileID = undefined;
	that.currentform = undefined;


	that.layoutbar.hide()
	var toolbar = that.toolbar;

	// hide the dragger, this is hard to get working ... (must keep the current form content when moving! to be implemented)
	that.toolbar.$dragdiv.hide();

	toolbar.$save = $("<div class='KViewPort_tool'><i class='fa fa-save fa-1x'></i></div>")
		.click(function() 
		{ 
		  // be strict here and to not allow form without patien set explicetely
		  if(that.currentFileinfo.patients_id == undefined || that.currentFileinfo.studies_id == undefined )
		  {
		  		$info.css({opacity: .2});
		  		$info.animate({opacity: 1}, 500);
		  		return false;
		  }

		   var fm = master.formManager;
		   if(that.formcontent.readonly)
		   	{
		   		alertify.error('Cannot save, this is a read-only form!');
		   		return false;

		   	}
		   fm.save(that.currentform.name, that.formcontent, that.currentFileinfo, function(fobj) { 
		   			that.toolbar.$save.removeClass("notsaved");
		   });

	 });
	toolbar.attach(toolbar.$save);
// 	toolbar.$close.off('click');
// 	toolbar.$close.on('click', function(ev)
// 	{
// 		return
// 	});


	var $inner =  $("<div class='KViewPort_formViewer'></div>").appendTo(that.$container);

	var $info = $("<div class='KViewPort_formViewer_pinfobar patientSetIndicator'></div>").appendTo(that.$container);
 	$info.on('dragover dragenter', function(ev)
 	{
 		$info.css('background', 'lightblue');
 		ev.preventDefault();
 	});
 	$info.on('dragleave', function(ev)
 	{
 		$info.css('background', 'initial');
 		ev.preventDefault();
 	});
 	$info.on('drop', function(ev)
 	{
 		var psid = {patients_id: tempObjectInfo[0].piz, studies_id: tempObjectInfo[0].sid};
 		if(tempObjectInfo[0].sid == undefined)
 		{
 			alertify.error('You have to drop a study.')
 		}
 		else
 		{
			setPatientStudy(psid);
 		}
		$info.css('background', 'initial');
		cleanAllDropIndicators();
		ev.stopPropagation();
		ev.preventDefault();
 		return false;
 	});

	that.psid = {patients_id:undefined, studies_id:undefined, patient_name:undefined} 
	function setPatientStudy(psid)
	{
		$info.empty();
		if(psid == false || psid.studies_id == undefined)
		{
			//var $p = $("<div class='' style='color:yellow'><span>No patient/study set.<br> Drag this tag to left panel to set.</span></div>").appendTo($info); 
			//var $p = $("<div class='' style='color:yellow'><span>No patient/study set.<br> Drop a patient/study here to select.</span></div>").appendTo($info); 
			$info.css('color', 'yellow').html("No unique patient/study set for this form.<br>Hold CTRL and drop a study to select.");
		}
		else
		{
			var name; // = tempObjectInfo[0].namecat.trim();
			$info.css('color', 'white');
			var $pline = $("<div></div>").appendTo($info); 
			var finfo = "";
			if (psid.filename != undefined)
				finfo = " (" + psid.filename + ")"; 
			$pline.append( $("<span > Form:"+ that.currentform.name +finfo + " <br> </span>") );
			$pline.append( $("<span > Subject: "+ psid.patients_id +" </span>") );
			$pline.append( $("<span > "+ psid.studies_id +" </span>") );
			that.psid = {patients_id:psid.patients_id, studies_id:psid.studies_id};

			that.currentFileinfo =  $.extend(that.currentFileinfo,that.psid);
		}
	}



	var $main =  $("<div class=''></div>").appendTo($inner);
	that.$main = $main;


	$main.hide()
	that.setContent = setContent;

	function setContent(ev,params)
	{

		// forms might not be here when tool has to be created.
		// so wait until they are there and re-run this function
		if( !master.formManager.isinstance )
		{
			master.formManager.updateListFromServer( function(){ setContent(ev,params)  } );
			return false;
		}


		if (typeof(ev.content) == 'string') // a loaded form content
		{
			var x = JSONparse_lazy(ev.content);
			ev.content = {name:x.KForm_name,content:x};	
			if (params.intent.patientedit | params.fileID == 'patientinfo')
				ev.content.name = 'patientinfo';
			if (params.intent.studyedit | params.fileID == 'studyinfo')
					ev.content.name = 'studyinfo';
		}


		//console.log(ev.content)
		// -name
		// -content (= the variable, undefined if created new)


		// workaround for double "content.content"" in uploadJSON
 		if(ev.content.content!=undefined && ev.content.content.hasOwnProperty("content") )
 			that.formcontent = ev.content.content;
 		else
 			that.formcontent = ev.content;

		// workaround for reading form content
		if(ev.formid != undefined)
		{
			//ev.content.content.formcontent
			that.formcontent.name = ev.formid;
			that.formcontent.readonly = 1;
			if(that.formcontent.content.formcontent)
				that.formcontent.content = that.formcontent.content = that.formcontent.content.formcontent;
		}

		if(that.formcontent.name == undefined)
		{
			alertify.error('The form does not contain a "KForm_name" or a "name" field.');
			return false;
		}

		that.currentform = master.formManager.getFormByID(that.formcontent.name);
		if(that.currentform == undefined)
		{
			alertify.error("Could not find the form definition for '" + that.formcontent.name + "'");
			that.close();
			return false;
		}
		
		// somehow/sometimes, the "name"" itself came in there (from event), delete it
		// delete that.formcontent.name
		that.prepViewer(that);
		viewport.setCurrentViewer(that);


		// recreate the content, in case the form layout hase changed (more fields), and to set the KForm_name field ...
		that.formcontent.content = KForm.getFormContent(that.currentform, that.formcontent.content);



		that.currentFormID =  that.formcontent.name;
		// this should be done with TRUE ids!!!!!
		//that.currentFormID = that.currentform.id;

		that.currentFileID = ev.fileID;
		if (that.currentFileID == undefined)
		   that.currentFileID = "NA";

		that.currentFileinfo = ev.fileinfo;


		toolbar.$info.html("");
		$main.children().remove();

		if (params.intent.patientedit | params.fileID == 'patientinfo')
			that.formcontent.PatientID = ev.fileinfo.patients_id;
		if (params.intent.studyedit | params.fileID == 'studyinfo')
			that.formcontent.StudyID = ev.fileinfo.studies_id;

		that.update();
	}

	that.customClose = function()
	{
		if (that.autosave_cid != -1)
		{		  
		  clearTimeout(that.autosave_cid);
		  that.autosave_cid = -1;
		  saveCurrentForm();
		}

	}


	function saveCurrentForm()
	{
	   var fm = master.formManager;
	   uploadJSON.askonOverwrite = false;
	   uploadJSON.quiet = true;
	   fm.save(that.currentform.name, that.formcontent, that.currentFileinfo, function(fobj) { 
		   uploadJSON.askonOverwrite = true;
		   uploadJSON.quiet = false;
		   that.toolbar.$save.removeClass('notsaved');
		});
	}

	that.autosave_cid = -1;
	function onchange(e)
	{		
	    that.toolbar.$save.addClass('notsaved');
		if (state.viewer.forms_autosave)
		{
			if (that.autosave_cid != -1)
			   clearTimeout(that.autosave_cid);
			that.autosave_cid = setTimeout(function()
			{ 				   
				saveCurrentForm();
			},2000);
	


		}
	}


	function update()
	{
		var obj =  that.formcontent;
		$main.children().remove();
		KForm.createForm(that.currentform, that.formcontent.content, $main , onchange)
		$main.show();
		if(that.currentFileinfo.studies_id!=undefined & that.currentFileinfo.patients_id!=undefined)
			setPatientStudy( {patients_id:that.currentFileinfo.patients_id, studies_id:that.currentFileinfo.studies_id, filename:that.currentFileinfo.Filename} );
		else
			setPatientStudy( patientTableMirror.getCurrentUniquePSID() );
		that.setInnerLayout();
	}
	that.update = update;

	that.setPatientStudy = setPatientStudy

	return that;

}


// ======================================================================================
// ======================================================================================
// ====== KForm 
// ======================================================================================
// ======================================================================================

 /** The form layouter
   * @class 
   * @alias KForm
   */
var KForm = {};
KForm.runningID = 0;;

KForm.createForm = function (form0,content0,$targetdiv0,onchange,isPreview)
{
	if (form0.html)
		{
			KForm.createFormHTML(form0,content0,$targetdiv0,onchange);
			return
		}


	delete content0.modified ;
	

 	function createForm_rec(form,content,$targetdiv, count)
 	{

		// this adds an "update" interface to the target object (=content).
		// with this, specific fields can receive additional updaters
		// the "onchange" function is GLOBAL for the object (=content) and will be re-set every time the form is created
		if(count==undefined)
		 	count = 0;		

		if (content == undefined)
		{
			console.warn("bug in form creation");
			return;
		}

		attachUpdater(content, onchange );

		// add dynmac stylesheet, but only if not already there (tag with name)	
		if(form.classdef !== undefined  & $(document.head).find('#KForm_'+form.name).length == 0 )
		{
			$("<style id='KForm_"+form.name+"' type='text/css'>" + form.classdef  +  "</style>").appendTo(document.head);
		}


		for (var r = 0; r < form.layout.length; r++)
		{
			var x = form.layout[r];
			if(x.title == undefined)
				x.title = x.name;
			
			var thetitle = x.title;
			var shortcutid = "";
			if(form0 && form0.tag == "READING" && (x.type=='option' || x.type=='check') && count < 99)
			{
				thetitle = " <span style='color:gray;position:relative;top:-0px;font-size:12px; margin-right:2px; background:none;'>"+count+" </span>" + thetitle ;
				shortcutid = "shortcut_" + count;
				count++;
			}

			
			 var element = "div";
			 if (x.element)
				 element = x.element;

			// for the labels, the for property
			var fortarget = x.name;
	
			var $c; 
			if (x.type == 'css')
			{
				setCSS($targetdiv,x.val);
			}
			else if (x.type == 'div' | x.type == 'placeholder') // placeholder div for personal use
			{
				$c = $(" <"+element+" placeholderid='"+x.id +"' class='KFormItem'>" + (x.val===undefined?'':x.val) +"</"+element+"> ");						
			} 

			else if (x.type == 'title')
			{
				$c = $(" <h2 class='KFormTitle' > " + x.val+" </h2> ");						
			} 
			else if (x.type == 'text')
			{
				$c = $(" <span class='KFormItem' style='word-wrap: break-word;'> " + x.val+" <br> </span> ");						
			} 
			else if (x.type == "separator")
			{
				$c = $("<"+element+" class='KFormSeparator'></"+element+">");
			}
			else if (x.type == "customelement")
			{
				$c = x.val(content);
				$c.addClass('KFormItem');
			}
			else if (x.type == "form")
			{
				$c = $("<"+element+"></"+element+">");
			    createForm_rec(x,content[x.name],$c);
			}
			else if (x.type == "formarray")
			{
				$c = $("<"+element+" class ='KFormItem_formarray'></"+element+">");
				var $menu = $("<div class='KFormItem_formarray_menu'></div>");
				$menu.append("<label>"+thetitle+"</label>").appendTo($c);
				x.createbutton = x.createbutton || 'Add new item';

				var createitm = function(cb) { return function(x,content,$c) {return function(ev)
				{ 
					if(content[x.name] == undefined)
						content[x.name] = new Array();
                    var newitm = KForm.getFormContent(x, {} ) 
					content[x.name].push( newitm);
					appendFormArrayItem(x, content, content[x.name].length - 1, $c, true);
					if(x.linkToMarkerset)
					{
						markerProxy.createMarker();
					}
					if (cb)
					    cb(newitm);
				} }(x,content,$c) }
				$( "<div class='modernbutton KFormItem_formarray_tool'> "+x.createbutton+"  <i class='fa fa-plus'></i></div>")
					.click(createitm()).appendTo($menu);

                if (x.altcreatebuttons != undefined )
                {
                	for (var s = 0; s < x.altcreatebuttons.length;s++)
                	{
						$( "<div class='modernbutton small KFormItem_formarray_tool'> "+x.altcreatebuttons[s].text+" <i class='fa fa-plus'></i></div>")
							.click(createitm(x.altcreatebuttons[s].fun)).appendTo($menu);
                	}
                }				
				function appendFormArrayItem(x, content, index, $c, slide)
				{
						var $innerc = $("<div class='KFormItem_formarray_subform' style='display:none'></div>").appendTo($c);
						if(slide)
							$innerc.fadeIn(170);
						else
							$innerc.show();
							
						createForm_rec(x,content[x.name][index],$innerc)
						if (x.autoID)
						{

							if (content[x.name][index].id == undefined)
							{
								var next_valid = 0;
								for (var k=0; k < content[x.name].length;k++)
								{
									if ( next_valid <= content[x.name][k].id )
										next_valid = content[x.name][k].id+1;
								}
								content[x.name][index].id = next_valid;

							}

							$("<div class='KFormItem_formarray_tool KFormItem_formarray_autoid'>#"+content[x.name][index].id +"</div>").appendTo($innerc);
						}
						// create a delete button
						if(!x.linkToMarkerset)
						{
							$("<div class='KFormItem_formarray_tool' style='right:0px'><i class='fa fa-trash'></i></div>").appendTo($innerc)
							.click(function()
							{
								var index = $innerc.prevAll().length-1; // must find the index each time from new!!
									$innerc.slideUp(110, function(){$(this).remove()}); 
									content[x.name].splice(index,1);

									//console.log(index);
							});
						}
				}

				if(content[x.name]	!= undefined)
				{
					for(var z=0; z < content[x.name].length ; z++)
					{
						appendFormArrayItem(x, content, z, $c, false)
					}	
				}
			}
			else if (x.type == "markerset")
			{
				$c = $("<"+element+" class ='KFormItem_formarray' style='position:relative;'></"+element+">");
				function dummy_closure(x, content, $c)
				{
					var $menu = $("<div class='KFormItem_formarray_menu'></div>");
					$menu.append("<label>"+thetitle+"</label>").appendTo($c);
					var $newbutton = $( "<div class='modernbutton small KFormItem_formarray_tool' style='max-width:150px;'><i class='fa fa-plus'></i> New marker </div>").appendTo($menu)

					var $itemcontainer = $( "<div class='' style='position:relative'></div>").appendTo($c)
					var $itemselector = $( "<div class='KFormItem_formarray_selectormenu'></div>").appendTo($itemcontainer)
					var $itemtopline = $( "<div class='KFormItem_formarray_highligterline'></div>").appendTo($itemcontainer)
					var mset;
					var creation_status = 0;

					function appendFormArrayItem(x, content, index, $c, point)
					{
							var $innerc = $("<div class='' style='margin-left:20px;'></div>").appendTo($c);
							// colored item for jump-to-point an selection
							var $selItem = $( "<div class='' style=''></div>").appendTo($itemselector);
							var $selItemColor = $( "<div class='KFormItem_formarray_colorbox' style=''></div>").appendTo($selItem);

							// form will be appended to point.formcontent
							// must work with a timeout, since formcontent is not yet there when first point creation  in KAnnotation Tool
							if(creation_status == 0)
								window.setTimeout(function() { createForm_rec(x, point.formcontent,$innerc, count) },10);
							else
								createForm_rec(x, point.formcontent,$innerc, count)

							function deleteFormArrayItem(point)
							{ 
									var index = $innerc.prevAll().length-1; // must find the index each time from new!!
									$innerc.slideUp(110, function(){$(this).remove()}); 
									$selItem.remove()
							}


							// create a delete button
							if(1)
							{
								var $delbutton = $("<div class='KFormItem_formarray_tool' style='right:0px'><i class='fa fa-trash'></i></div>").appendTo($innerc)

							}

							function makeactive(pp)
							{
								$itemselector.children().removeClass('active')
								$selItem.addClass('active');
								$itemcontainer.children().hide();
								$itemselector.show();
								$itemtopline.show();
								$innerc.show();
								$itemtopline.css('background-color', $selItemColor.css('background-color' ) ) 

							}

							point.callbacks.delete.form = deleteFormArrayItem;
							point.callbacks.changeProps.form = function(pp) 
							{ 
								$selItemColor.css('background', pp.p.color.getCSS()) 
								if($selItem.hasClass('active'))
									$itemtopline.css('background-color', $selItemColor.css('background-color' ) ) 
							}
							point.callbacks.mousedown.form = makeactive
							point.callbacks.jumptopoint.form = makeactive

							$delbutton.click(point.deletepoint);
							$selItem.click(point.jumpToPoint)

							makeactive();

					}

					var appendNewFormArrayItem = function(x, content, $c)
					{	return function(newpoint)
						{ 
							if(content[x.name] == undefined)
							{
								//Object.defineProperty(content[x.name], 'markerset', { get: function() { return mset.objectify()} } ) ;
								// must define getter in an objection creation, and not defineProperty, otherwise stringify will not extract the valuies
								content[x.name] = { get markerset(){ return mset.objectify()  }   }

							}
							// formcontent is not yet set at first import
							if(creation_status && newpoint.formcontent == undefined)
								newpoint.formcontent = KForm.getFormContent(x, {} ) ;
							appendFormArrayItem(x, content, content[x.name].length - 1, $c, newpoint);
						};
					}(x,content,$itemcontainer)

					if(isPreview)
						markerProxy.delSet(x.name);
						
					// create the markerset if not existing
					if( markerProxy.markersets[x.name] == undefined )
					{
						var state = {ignoremodified:true, keepalive: true};
						if(isPreview)
							state.delSetOnPanelClose = 1;

						$.extend(true, state, x.state);
						mset = markerProxy.newSet({name:x.name, uuid: x.name, type: x.markersettype || "circles", showPanel:1 ,templates:x.templates,  state:state});
						
						if(mset.markerPanel && !isPreview) // hide some buttons, save functionality only via form.
						{
							mset.markerPanel.$close.hide();
							mset.markerPanel.$saveMarkers.hide();
						}
					}
					else
					{
						mset = markerProxy.markersets[x.name];	
					}
					mset.deleteAllPoints();
					mset.callbacks.addpoint.form = appendNewFormArrayItem; // append new item via callback of point creation
					$newbutton.click( function(){markerProxy.createMarker(undefined, mset )} );
					
					// if content already exists (for example, after loading existing json => import the points 
					if(content[x.name]	!= undefined)
					{
						markerProxy.import([content[x.name].markerset], mset)
						content[x.name] = { get markerset(){ return mset.objectify()  }   }
					}
					creation_status = 1;
					if(isPreview) // on preview, directly create an element
					{
						markerProxy.createMarker(undefined, mset )
					}
				}
				dummy_closure(x, content, $c);
			}
			else if (x.type == "markerpoint")
			{
				$c = $("<"+element+" class='KFormItem'></"+element+">");
				if(x.title !== undefined & x.title != "" )
					$("<label class='KFormItem_label'>"+x.title+": </label>").appendTo($c);
			
				// point was already created on demand in KForm.getFormContent
				var point = content[x.name];
				// create a point row without possibility to delete it
				var $row = point.createMarkerRepresentation(form.name, {delete:0, coords:0}).addClass('KForm_markerpointrow');

				// if the defintion for the point has a property "form", create this form  and forward to the point createRepresentation callback list
				// only this way, all representations in all viewports for this point will have the corresponding form
				if(x.form !=undefined)
				{
					point.formcontent  = KForm.getFormContent(x.form, {} );
					if(0)//x.formAtPoint) // create the form also at the point in eacht viewport
					{
						point.callbacks.createinfobox.form = function(dummy, $target){ 
							 createForm_rec(x.form, point.formcontent, $target)
						 };
					}
					else
					{
						 createForm_rec(x.form, point.formcontent, $row);
					}
				}
				$row.appendTo($c);
				point.callbacks.delete.KForm = function()
				{
					if($c.parent().hasClass('KFormItem_formarray_subform'))
						$c.parent().remove();
					else
						$c.remove();
				};
			}


			else if (x.type == 'json')
			{
				// make a lazy json
				function myonfocus(ev, x)
				{
					if (document.activeElement != ev.target)
					{

						var jsonstring = myJSONStringify(content[x.name],"")
						$(ev.currentTarget).val(jsonstring);
						setTimeout(function(ev){ return function() 
						{
							var target = ev.currentTarget;
							if (target[0] != undefined)
								target = target[0];
							$(target).height( target.scrollHeight-4);
						} }(ev),0);
					}

				}
				function myofffocus(ev, x)
				{
  					var jsonstring =$(ev.currentTarget).val();
  					try
  					{
						eval('var parsed = ' +  jsonstring);
						content[x.name] = parsed;
						content.modified = true;
						content.update(x.name);       
  					}
					catch(err)
					{ 
						$.notify('Sorry, the JSON intent json\n'+jsonstring+' \ncould not be parsed. Content was not updated.', 'error');
					}
  					if (onchange) onchange(x, ev.currentTarget);
  					if (x.onchange) x.onchange(content[x.name], ev.currentTarget);
				}

				$c = $("<"+element+" class='KFormItem'><label class='KFormItem_label' for='"+x.name+"' > "+x.title+": </label></"+element+">")
				var $textarea = 	$("<textarea name='"+x.name+"' "+attr+"></textarea>").appendTo($c).on("click",  function(x){ return function(ev){ myonfocus(ev, x); } }(x)   )
					.on("mouseleave",  function(x){ return function(ev){ myofffocus(ev, x); } }(x)   )
					.on("keyup",  function(ev){ ev.stopPropagation(); }  )
					.on("keydown",  function(ev){ ev.stopPropagation(); }  )
				 myonfocus({currentTarget: $textarea}, x);

					var valchanged = function($div) {return function(val)
					{
						$div.val( myJSONStringify( val) );
					}}($textarea)
					content.update.add(x, valchanged, $textarea);
			
			}

			else if (x.type == 'textarea')
			{


				if (x.mode == undefined)
				{

					$c = $("<"+element+" class='KFormItem'><label class='KFormItem_label' for='"+x.name+"' > "+x.title+": </label></"+element+">")
					var $textarea  = $("<textarea name='"+x.name+"' "+attr+"></textarea>").appendTo($c)
					$textarea.html(content[x.name])
					.on("keydown",  function(ev){ ev.stopPropagation(); }  )
					.on('keyup',function(i,x) { return function(e){
						e.preventDefault();
						e.stopPropagation();
						 content[i] = $(e.currentTarget).val();
						 content.modified = true;
						 content.update(x.name);        					 
						 } }(x.name,x));     

					setTimeout(function(){
						$textarea.height( $textarea[0].scrollHeight-4);
					},0);

					var valchanged = function($div) {return function(val)
					{
						$div.val(val);
					}}($textarea)
					content.update.add(x, valchanged, $textarea);
				}
				else
				{
					$c = $("<"+element+" class='KFormItem'><label class='KFormItem_label' for='"+x.name+"' > "+x.title+": </label></"+element+">")
					var $textarea  = $("<textarea name='"+x.name+"' "+attr+"></textarea>").appendTo($c).html(content[x.name])
						var editor = CodeMirror.fromTextArea($textarea.get(0), {
							  lineNumbers: true,
							  lineWrapping: true,
							  mode:'javascript',
							  matchBrackets: true
							});
						editor.setValue(content[x.name]);	
						editor.clearHistory();    
						setTimeout(function() {
							editor.refresh();
						},1);

						$c.bind('keyup',function(editor,i,x) { return function(e)
						{
							 content[i] = editor.getValue();
							 content.modified = true;
							 content.update(x.name);  
						}}(editor,x.name,x));


				}




						        
			}
			else if (x.type == "input" )
			{ 
		
				$c = $("<"+element+" class='KFormItem'><label class='KFormItem_label' for='"+x.name+"' > "+thetitle+": </label></"+element+">")
				
				if (typeof(x.defaultval) === 'number') 
					x.data = ['number'];
				if (x.data == undefined) 
					x.data = ['text'];
			    var attr = "";
			    
			    if (x.attribute != undefined)
			    	attr = x.attribute;
				
				var $input ;
			
				if (x.data[0] == 'text')
				{
					var style = "text"
					if (x.style == 'password')
					 style = "password";
					$input =$("<input type='"+style+"'  name='"+x.name+"' "+attr+">").appendTo($c).val(content[x.name])
					.on('keyup',function(i,x) { return function(e){
						 content[i] = $(e.currentTarget).val();
						 content.modified = true;
						 content.update(x.name);        					 
						 } }(x.name,x));
				}
				else if ( x.data[0] == 'integer' | x.data[0] == 'number' )
				{
					if (x.style == 'slider')
					{
						$input =	$("<input name='"+x.name+"' "+attr+" type='range' min='"+x.data[1]+"' max='"+x.data[2]+"' /><span style='position:relative;top:-5px;padding:4px'>"+content[x.name]+"</span>").appendTo($c).val(content[x.name])
						.on('input',function(x) { return function(e){
							 content[x.name] = $(e.currentTarget).val();
							 $(e.currentTarget).next().text( content[x.name]);
							 content.modified = true;
							 content.update(x.name);        					 
							 } }(x));      
					}
					else
					{					
						$input =$("<input "+attr+" type='number'  name='"+x.name+"' min='"+x.data[1]+"' max='"+x.data[2]+"'>").appendTo($c).val(content[x.name])
						.on('change',function(x) { return function(e){
							 content[x.name] = $(e.currentTarget).val();
							 content.modified = true;
							 content.update(x.name);        					 
							 } }(x));      
					}
				}

				var valchanged = function($div) {return function(val)
				{
					if (document.activeElement != $div.get(0))
					{
						$div.val(val);
					// this is for the slider
						$div.next().text(content[x.name]);
					}
				}}($input)
				content.update.add(x, valchanged, $input);

// 				$input.valchange = function(val)
// 				{
// 					this.val(val);
// 					// this is for the slider
// 					this.next().text(content[x.name]);
// 				}
// 				content.update.add(x, valchanged, $input);
				


			}
			else if (x.type == "option")
			{
				if(x.ids === undefined) 
					x.ids = x.choices;

 	   		    if (content[x.name]==undefined )
 	   		    	content[x.name] = x.ids[0];

					
				var tempname = 'KFormID' + (KForm.runningID++) + x.name;	
				if (x.style == undefined) x.style = "";
				if (x.style.search("radio")>=0)
				{
					$c = $("<"+element+" class='KFormItem'><label class='KFormItem_label' for='"+x.name+"' > "+thetitle+": </label></"+element+">")

					var optlist = "";
					for (var i = 0; i < x.choices.length;i++)
					{
						var selected = "";
						if (x.ids[i] == content[x.name] ||  (content[x.name]==undefined && i==0))
							selected = "checked";

						// for radio choices in form arrays, this does not work. must have unique names !!!
						optlist += "<label><input type='radio' name='"+tempname+"' value='"+ x.ids[i] +"' "+ selected +" />" + x.choices[i]  +"</label>"
						if (x.style.search("vert")>=0) optlist += "<br>";
					}

					var $sel = $("  <div style='display:inline-block'> "+ optlist +" </div> " ).appendTo($c).click(function(i,x) { return function(e)
							  {
								var opts = $(e.currentTarget).find("input");
								for (var j = 0;j < opts.length;j++)
									if (opts[j].checked)
										content[i] = opts[j].value;
								 content.modified = true;
								 content.update(x.name);        					 
							  } }(x.name,x) );				
					
					var valchanged = function($div) {return function(val)
					{
						// uncheck all, and then set the one with val
						$div.find("input").prop('checked', false);
						$div.find("input[value='"+val+"']").prop('checked', true);
					}}($sel)
					content.update.add(x, valchanged, $sel);

				}
				
				else // combobox
				{
					$c = $("<"+element+" class='KFormItem'><label class='KFormItem_label' for='"+x.name+"' > "+thetitle+": </label></"+element+">")
					//$c = $("<div class='KFormItem'> "+ thetitle + " </div>");
					

					var optlist = "";
					for (var i = 0; i < x.choices.length;i++)
					{
						var selected = "";
						if (x.ids[i] == content[x.name])
							selected = "selected";
						optlist += "<option value='"+ x.ids[i] +"' "+ selected +">"+x.choices[i]+"</option>";
					}
					var $sel = $("  <select f> "+ optlist +" </select>" ).appendTo($c).click(function(i,x) { return function(e)
							  {
								content[i] =  $(e.currentTarget).find('option:selected').val() ;
								 content.modified = true;
								 content.update(x.name); 
							  } }(x.name,x) );
					
					var valchanged = function($div) {return function(val)
					{
						// uncheck all, and then set the one with val
						$div.find("option").prop('selected', false);
						$div.find("option[value='"+val+"']").prop('selected', true);
					}}($sel)
					content.update.add(x, valchanged, $sel);


				}
			}

			else if (x.type == 'rating')
			{
				$c = $("<"+element+" class='KFormItem' ssstyle='display:flex;'><label class='KFormItem_label' for='"+x.name+"' > "+thetitle+": </label></"+element+">")

				var $form = $("<div class='KFormItem_rating'></div>").appendTo($c);

				var $arr = $("<table></table>").appendTo($form);
				var $head = $("<tr></tr>").appendTo($arr);
				$head.append($("<td><span></span></td"));					
				for (var t=0; t < x.ratings.length;t++)
					$head.append($("<td><span>"+x.ratings[t]+"</span></td"));					
				var rows = {};
				for (var t=0; t < x.items.length;t++)
				{
					var item =  x.items[t];
					var tempname = 'KFormID' + (KForm.runningID++) + x.name;	
					var $row = $("<tr></tr>").appendTo($arr)
					.click(function(n,t,x) { return function(e)
						  {
							var opts = $(e.currentTarget).find("input");
							for (var j = 0;j < opts.length;j++)
							{
								if (opts[j].checked)
								{
									//content[n][t] = opts[j].value;
									// save by key, not as array!
									content[n][x.items[t]] = opts[j].value;
								}
							}
							content.modified = true;	
							//content.update(x.name, t); 				    					
							content.update(x.name,item); 				    					
						  } }(x.name,t,x) );
					$row.append($("<td><span>"+x.items[t]+"</span></td"));					
					for (var i = 0; i < x.ratings.length;i++)
					{
						var selected = "";
						//if (x.ratings[i] == content[x.name][t])
						if (x.ratings[i] == content[x.name][item])
							selected = "checked";
	
						$row.append("<td> <input type='radio' name='"+tempname+"' value='"+ x.ratings[i] +"' "+ selected +"></td>")
					}
					rows[item] = ($row);
				}
				
				var valchanged = function($div) {return function(val, t)
				{
				// uncheck all, and then set the one with val
					$div[t].find('input').prop('checked', false);
					$div[t].find("input[value='"+val[t]+"']").prop('checked', true);
				}}(rows)

				content.update.add(x, valchanged, $arr );
				

			}

			else if (x.type == "check")
			{	
				var cid = Math.random() + x.name;
				$c = $("<"+element+" class='KFormItem'><label class='KFormItem_label' for='"+cid+"' > "+thetitle+": </label></"+element+">")
				var $check= $("<input type='checkbox' name ='"+x.name+"' id='"+cid+"'>").appendTo($c).prop('checked', content[x.name]).on('change',function(i,x) {return function(e)
					{ 
					content[i] = $(e.currentTarget).prop("checked"); 
					content.modified = true;	
					content.update(x.name);     			
					} }(x.name,x));
			
					var valchanged  = function($div) {return function(val)
					{
						$div.prop('checked', val);
					}}($check)
					content.update.add(x, valchanged, $check);

			}

			if ($c != undefined)
			{
				setCSS($c,x.css);	
				
				if (x.css_spec)
				{
					for (var k in x.css_spec)
					{
						setCSS($c.find(k),x.css_spec[k]);
					}
				}

							
				if (x.class)
				{
					$c.addClass(x.class);
					$c.children().addClass(x.class);
				}

				if (form.items)
				{
					setCSS($c,form.items.css);
					if (form.items.class)
					{
						$c.addClass(form.items.class);
						$c.children().addClass(form.items.class);
					}
				}



				if (x.tooltip)
				{
					$c.attr('data-toggle','tooltip');
					$c.attr('title',x.tooltip);
				}
				if (x.name)
					$c.attr('name',x.name);
				if(shortcutid !="")	
					$c.attr('shortcutid', shortcutid )

				$c.appendTo($targetdiv);
			}
		}
 	}


	function setCSS($c,css)
	{	
		if ($c == undefined)
			return
	    if (css)
		{
			for (var i = 0; i < css.length;i+=2)
				$c.css(css[i],css[i+1]);
		}
	}


		/***************************************************************************************
		*  Updater
		****************************************************************************************/

		function attachUpdater(obj, onchange)
		{
		  // the object already has an updater. Reset to the "onchange" function and return
		  if (obj.update != undefined)
		  {
			 if(onchange != undefined)
				obj.update.onchange = onchange;
		  	 return;
		  }


		  function Update(field, varargin)
		  {
			 this.update.broadcast(field,this[field], varargin);
		  }

		  // varargin is needed for example for rating to define a row
		  Update.broadcast = function(field,val, varargin)
		  {
		  	 if (val == undefined) // undefinded value might cause error in jquery value=
		  		val = "";
			 for (var k = 0;k < Update.funlist.length; k++ )
				if (Update.funlist[k].field == field)
				  Update.funlist[k].fun(val, varargin);
			  
			  if(Update.onchange)
			  		Update.onchange(obj, field, val);
		  }

		  Update.add = function(x,fun, $element)
		  {
			Update.funlist.push({field:x.name,fun:fun});
			
			// set the remover already here when adding an updater.
			if($element != undefined)
			{
				$element.bind('destroyed', function() { 
				obj.update.remove(fun); 
				//console.log( obj );  
				//console.log( $element.val() );  
				});
			}

		  }
		  
		  Update.remove = function(fun)
		  {
			 for (var k = 0;k < Update.funlist.length; k++)
				if (Update.funlist[k].fun == fun)
				{
					Update.funlist.splice(k,1);
					break;
				}
		  }

		  Update.funlist = [];
	      obj.update = Update;

		  if(onchange != undefined)
		  	obj.update.onchange = onchange;



		  return obj;

		}




	createForm_rec(form0,content0,$targetdiv0)


}


KForm.createFormHTML = function (form0,content0,$targetdiv0,onchange)
{

	function setContent(element)
	{
		var e = $(element.target);
		var id = e.attr("id");
		var value = e.val();
		content0[id] = value;
		
		onchange();
	}


	var $page = $(form0.html);
	$page.appendTo($targetdiv0);
	var inputs = $page.find("input,textarea,select");
	for (var k = 0; k < inputs.length;k++)
	{
		$(inputs[k]).val(content0[$(inputs[k]).attr("id")]);
		$(inputs[k]).on("input",setContent);

	}
}



KForm.getFormContentHTML = function(form,obj)
{
	if (obj == undefined)
	   obj = {KForm_name:form.name, html:true};
	
	var $page = $(form.html);
	var inputs = $page.find("input,textarea,select");
	for (var k = 0; k < inputs.length;k++)
		if (obj[$(inputs[k]).attr("id")] == undefined)
			obj[$(inputs[k]).attr("id")] = $(inputs[k]).val();


	return obj;
}

/***************************************************************************************
*  find by type, name or ...
****************************************************************************************/
KForm.findFormItem = function(form, how, search)
{
	var out = [];

	function find_rec(layout)
	{
		for (var k =0;k < layout.length;k++)
		{
			if(layout[k][how] == search)
				out.push(layout[k].name)
			
			if(layout[k].layout !== undefined)
				find_rec(layout[k].layout);
			else if(layout[k].form !== undefined)
				find_rec(layout[k].form.layout);
		}

	}
	find_rec(form.layout)
	return out;

}


/***************************************************************************************
*  Get form content 
****************************************************************************************/
KForm.getFormContent = function(form,obj)
{
	if (form.html)
		return KForm.getFormContentHTML(form,obj);

	if (obj == undefined)
	   obj = {KForm_name:form.name};
	for (var k =0;k < form.layout.length;k++)
	{
		if ( form.layout[k] != undefined && obj[form.layout[k].name] == undefined )
		{
			if( form.layout[k].type== 'markerpoint')
			{
				if( markerProxy.currentSet )// form.layout[k].forReading)
				{
					// re-use the same markerset form this form
					if(markerProxy.currentSet)
					{
						//var mset = markerProxy.currentSet;
						var point = markerProxy.createMarker()
					}
							
				}
				else
				{
					// create a new markerset
					var mset = new KMarkerset('M0');
					var point = mset.addpoint();
				}
				// this is the pointer to the "full" point, i.e. all point properties
				// must be deep copied and entschlacked before saving
				obj[form.layout[k].name]  = point;
			}
			else // a native type
			{
				var dval = form.layout[k].defaultval;
				if( dval != undefined )
				{
					// rating, convert to struct
					if(form.layout[k].type == "rating")
					{
						obj[form.layout[k].name] = {};
						for(var u=0; u<dval.length; u++)
						{
							obj[form.layout[k].name][form.layout[k].items[u]] = dval[u];
						}
					}
					else
					{
						obj[form.layout[k].name] = dval;
					}
				}
				
				// conditional default val (mostly for readings etc )
				if( form.layout[k].defaultvalif != undefined )
				{
					for(var z=0; z<form.layout[k].defaultvalif.length-1 ; z+=2)
					{
						try
						{
							var expr = "KViewer.readingTool.ccase." + form.layout[k].defaultvalif[z] ;
							if( eval(expr) )
								obj[form.layout[k].name] =  form.layout[k].defaultvalif[z+1];
						}
						catch(err)
						{
							console.log(err);
							alertify.alert('An error occured in the forms `defaultvalif:`   ' + expr + err)
						}
					}
				}

			}
		}

		if (form.layout[k] != undefined && form.layout[k].type == 'form' )
		{
			if (obj[form.layout[k].name] == undefined)
				obj[form.layout[k].name] = {};
			KForm.getFormContent(form.layout[k],obj[form.layout[k].name]);

		}
	}
	return obj;
}


/***************************************************************************************
*  Get a random form content (mostly for testing reading, teaching)
****************************************************************************************/
KForm.getFormContentRandom = function(form,obj)
{
	if (form.html)
		return KForm.getFormContentHTML(form,obj);

	if (obj == undefined)
	   obj = {KForm_name:form.name};
	for (var k =0;k < form.layout.length;k++)
	{
		if ( obj[form.layout[k].name] == undefined )
		{
			// only radio type implemented so far
			if(form.layout[k].ids)
			{
				var numanswers = form.layout[k].ids.length;
				var ind = Math.floor( Math.random()*(numanswers-.0001) );
				obj[form.layout[k].name] = form.layout[k].ids[ind];
			}
			else if( form.layout[k].defaultval != undefined )
				obj[form.layout[k].name] = form.layout[k].defaultval
		}

		if (form.layout[k].type == 'form' )
		{
			if (obj[form.layout[k].name] == undefined)
				obj[form.layout[k].name] = {};
			KForm.getFormContentRandom(form.layout[k],obj[form.layout[k].name]);

		}
	}
	return obj;
}




/***************************************************************************************
*  check empty fields
****************************************************************************************/
KForm.checkEmptyFields = function($form, highlight)
{
    var names = new Array();
    var nonFilled = new Array();
	var highlighcolor = 'rgba(180,0,0,1)';
	// unset highlight first

    $form.find("input[type='radio']").each( function(k, e)
    {
      if($(e).css('display') == 'none') return; // return for hidden elements
      var tname = $(e).attr('name');
      if(names.indexOf(tname) == -1)
      {
        if(highlight)   $form.find("label[for='"+tname+"']").css( 'background', '');
        names.push(  $(e).attr('name') );
        var row = $form.find("input[type='radio'][name='"+tname+"']:checked");
        if(row.length == 0 )
        {
          nonFilled.push(tname);
          if(highlight)   $form.find("label[for='"+tname+"']").css( 'background', highlighcolor);
        }
      }
    });
	
    $form.find("input[type='text']").each( function(k, e)  
    { 
	    var tname = $(e).attr('name');
        if(highlight)  $form.find("label[for='"+tname+"']").css( 'background', 'none');
    	if( $.trim(this.value) === "" )
    	{
           nonFilled.push(tname);
           if(highlight)  $form.find("label[for='"+tname+"']").css( 'background', highlighcolor);
    	}

    });


	if(nonFilled.length > 0)
		return false;
	else
		return true;

}




// ======================================================================================
// ======================================================================================
// ============= KFormManager
// ======================================================================================
// ======================================================================================


function KFormManager(master)
{
	/** Managing forms
	* @class 
	* @alias KFormManager
	* @augments KToolWindow
	*/
	var that = new KToolWindow(master,
	$("<div class='KView_tool '><i class='fa fa-file-text fa-1x'></i></div>")
	.append( $("<ul class='KView_tool_menu'></ul>").append($("<li>Forms</li>")) ) );

	that.name = 'Forms';

    that.$topRow.addClass("FormTool_topmenu");

	var formman = master.formManager;

	var $menu = $("<ul></ul>");
	var sel = state.viewer.forms_autosave?"-dot":"";
	var $autosave = $("<li> <a> Autosave</a>  <i class='fa fa"+sel+"-circle-o'></i></li>").click(function(){
		$autosave.find(".fa").toggleClass("fa-dot-circle-o").toggleClass("fa-circle-o");
		state.viewer.forms_autosave = !state.viewer.forms_autosave
	}  ).appendTo($menu);
	var sel = state.viewer.forms_user_specific_naming?"-dot":"";
	var $userspecname = $("<li> <a> User specific naming </a> <i class='fa fa"+sel+"-circle-o'></i></li>").click(function(){
		$userspecname.find(".fa").toggleClass("fa-dot-circle-o").toggleClass("fa-circle-o");
		state.viewer.forms_user_specific_naming = !state.viewer.forms_user_specific_naming

	}  ).appendTo($menu);

	that.$topRow.append($("<li  ><a>Forms</a></li>").append($menu) );
	



  var $innerDIV = $("<div ondragover='event.preventDefault();' class='annotation_tool_listDIV'></div>").appendTo(that.$container);
  var $table = $("<table  class='localfiletable'></table>").appendTo($innerDIV);
  var $help = $("<div  class=''>Drag a form into the viewer to fill out.</div>").appendTo($innerDIV);
  $innerDIV.on("drop",function(e)
  {
    e.preventDefault();
    var params = getloadParamsFromDrop(e.originalEvent,undefined);

  });

  that.resize = function(hei)
  {
      that.$container.height(hei);
      $innerDIV.height(hei-that.$container.find('.KToolsTopMenu').height());
      
  }

	/***************************************************************************************
	Find the correct form for dropped file (if form was dropped, new "file" is generated)
	****************************************************************************************/		
	that.getFormByID = function(name)
	{	 
		for (var k=0;k< that.forms.length;k++)
		{
			var form = that.forms[k].content;
			if (that.forms[k].id == name || form.name.toLowerCase() == name.toLowerCase()   ) // comparison by name or id
			{
				var tform = $.extend(true, {}, form);
				return form;
			}
		}
		return undefined;
	}
	that.getForm = function(name,content)
	{	 
		for (var k=0;k< that.forms.length;k++)
		{
			var form = that.forms[k].content;
			if (form.name.toLowerCase() == name.toLowerCase()) // comparison by id
			{
				var newcontent = KForm.getFormContent(form,content);
				return {form: form, content: newcontent, formid: k};
			}
		}
		return undefined;
	}


	that.getIndexFromName = function(name)
	{	 
		for (var k=0;k< that.forms.length;k++)
		{
			if (that.forms[k].name == name)
			{
				return k;
			}
		}
		return undefined;
	}

 
	var psidforms = KForm.PSIDForm();

	function setDefaultForms()
	{
		that.forms = [ 	{id:"X01", iswritable:false, content: psidforms[0]}, 
						{id:"X02", iswritable:false, content: psidforms[1]} ,
						{id:"X03", iswritable:false, content: psidforms[2]}  ];

        var cnt = 4;
		for (var key in static_info.forms)
		  {
			
			  if (key.search('\\.html')>-1)
			  {
				  var x = static_info.forms[key];
			  	  key = key.replace('.html','');
				  var y = {id:"X0"+cnt,iswritable:false,html:true,content:{name:key,html:x},name:key};
				  that.forms.push(y);
			  }
			  else
			  {
				  eval('var x = ' + static_info.forms[key].replace(/\\\\"/g,''));
				  var y = {id:"X0"+cnt,iswritable:false,content:x,name:key};
				  that.forms.push(y);
			  }
			  cnt = cnt + 1;
		  }

	}
	setDefaultForms()


	/***************************************************************************************
	Load form list from server
	****************************************************************************************/
	var formsLoadedFirstTime = false;
	that.updateListFromServer = function(callback)
	{
		window.setTimeout(function(){
		jsonTable_loadFormattedList('form', function(res)
		{
			setDefaultForms();

			for(var id in res)
				that.forms.push(res[id])
			that.update();
			that.loadedFromServer = true;
			if(callback)
			{
				callback()
			}
		});
		},200);
	}
	
	
	/***************************************************************************************
	The form template elements
	****************************************************************************************/
	var tttemplate = KForm.templates();
	var genericForm = {
						type: "form",
						content: tttemplate.basis,
						id :"0",
						iswritable:false
					  };


	that.$topRow.append(  $("<li style='fffffloat:right'><a><i class='fa fa-pencil' ></i> New Form </a></li>").click(  function() {copyElement(genericForm);} ) );
	

	/***************************************************************************************
	copyElement
	****************************************************************************************/
	function copyElement(fromwhich)
	{

		if(fromwhich == undefined)	
			fromwhich = genericForm;
		
		fromwhich.type = 'form';	// important for old objects. Type is needed.
		jsonTable_copyElement(fromwhich, function(newobj)
		{
			if(newobj instanceof Object)
			{
				that.forms.push(newobj);
				that.update();
				new KFormDesigner(newobj);
			}
		})
	}
	that.createNewForm = copyElement;

	

	/***************************************************************************************
	that.update
	****************************************************************************************/
	that.update = function()
	{
		$table.children().remove();
		//    var fields = ['id', 'name', 'iswritable', 'project']

		var $thead = $("<thead>").appendTo($table);
		var $row = $("<tr ></tr>").appendTo($thead);
		$row.append($("<td>id </td>"));
		$row.append($("<td>name </td>"));
		//$row.append($("<td>iswritable</td>"));
		$row.append($("<td>project</td>"));
		$row.append($("<td class='fixedwidth' data-fixedwidth='6'></td>"));

		var $tbody = $("<tbody>").appendTo($table);
		var forms = that.forms;
		
		// start from index 3 (omit patient forms)
		
		for  (var k = 3;k<forms.length;k++)
		{
			var dragstuff = "draggable='true' data-type='file' data-piz='' data-sid='' data-tag='/FORM/' data-fileID='"+forms[k].content.name+"' data-subfolder='' data-filename='' data-mime='emptyform'";
			// should work with ids in future: set data-fileID to form id
			
			dragstuff = dragstuff + " ondragstart='setdragstart(event);' ondragend='setdragend(event);' ondblclick='loadDataOndblClick(event);'";
			
			var $row = $("<tr class='formtable' " + dragstuff + "></tr>").appendTo($tbody);

			$row.on("contextmenu", function (ev) { formContextMenu(ev); });
			$row.append($("<td>" + forms[k].id + "</td>"));
			$row.append($("<td>" + forms[k].content.name + "</td>"));
			//$row.append($("<td>" + forms[k].iswritable + "</td>"));
			$row.append($("<td>" + forms[k].content.project + "</td>"));

			var addstyle = (forms[k].iswritable == true)?(""):("style='color:hsl(0,0%,80%)'")
			$row.append($("<td> <i "+addstyle+"class='tablebutton fa fa-fw  fa-wrench'></td>").click(function(k) { return function(e) 
			{ 
				if(forms[k].iswritable != true)
				{
					alertify.error('You do not have the permission to change this form.');
					return false;
				}
				else
				{
					new KFormDesigner(forms[k]);
				}
			} }(k) ) ).appendTooltip('changeFormDesign');

		}    
		that.attachTableOperator($table.parent());
	}

  that.save = function(formtype,content,fileinfo,onsuccess)
  {
	  if (formtype == 'patientinfo' | formtype == 'studyinfo' | formtype == 'patientstudyinfo'  )
	  {
	     var obj = {piz:fileinfo.patients_id, sid:'%', content:content.content};
	   //  obj = content.content;
	     if (formtype == 'studyinfo' | formtype == 'patientstudyinfo' )
	         obj.sid = fileinfo.studies_id;
	     if (formtype == 'patientinfo')
	     {
			delete obj.content.Series;
			delete obj.content.StudyID;
			delete obj.content.StudyDate;
			delete obj.content.StudyDescription;
			delete obj.content.StudyInstanceUID;
			delete obj.content.StudyTime;
	     }
	           
         var json = encodeURIComponent(JSON.stringify(obj));
         ajaxRequest('command=save_patientinfo_studyinfo&json=' + json , function(e)
           {
           	  renderPatientTable();              
              if (onsuccess)
                 onsuccess(e);
           });
	  }
	  else 
	  {	  
		  delete content.modified;
		  var finfo = {subfolder:'',tag:'/FORM/',subfolder:'forms'};
		  if (fileinfo)
		  	finfo = $.extend(finfo,fileinfo);

		  // set this again here, might have gotten lost
		  content.KForm_name = formtype;
		  // must work with ids
		  

		  var name = formtype;
		  if (state.viewer.forms_user_specific_naming)
			  name += "." + userinfo.username;

		  uploadJSON(name,content,finfo,function(r)
		  {
			if (onsuccess)
				onsuccess(r);
			
		  });	
	  }
  }



  var formContextMenu = KContextMenu(
  function(ev) {

      var target = ev.target;
      for (var k = 0;k< 3;k++)
      {
        if ($(target).is("tr"))
           break;
        target = $(target).parent();
      }
      prepObjectInfo(target);


      var $menu = $("<ul class='menu_context'>")

      $menu.append($("<li onchoice='save' >save</li>"));
      $menu.append($("<li onchoice='open' >open</li>"));
      $menu.append($("<li onchoice='edit' >edit form</li>"));

      return $menu;
  },
  function (str,ev)
  {
      var k = that.getIndexFromName(tempObjectInfo[0].fileID);
      if (str=="save")
      {
      	that.save(that.forms[k].name,that.content[k], function() {
			  delete that.content[k].modified;
			  that.update(); });
      } else if (str=="open")
      {
      	 KViewer.viewports[0].openFile({fileID:that.forms[k].name, URLType: 'form'});
      } 
      else if (str=="edit")
      {
      	 
      } 
  });





	that.updateListFromServer()
	signalhandler.attach('projectchanged', that.updateListFromServer);
	return that;
}








/***************************************************************************************
myJSONStringify
****************************************************************************************/
function myJSONStringify(obj,indent,level)
{
	/*
		this is a "lazy" stringify function.
		it creates a JSON-like string from a javascript object, a:{b:"2"}
		unlike "true" json
			- variable names are NOT quoted
			- \ is NOT escaped as doubleslash
	*/
	indent = indent || "";
	if (obj == undefined)
		return "undefined";
		
	var indentOld = indent;
	var str = "";
	var newline = "\n";
	if (obj instanceof Array)
	{
		
		// line break for arrays of objects
		if(obj.length > 0 & obj[0] instanceof Object)
		{
			// leave brackets for first level. but must remember type (object / array ) in caller then.
			if(level !== 0)
			{
				indent += "\t";
				str += newline + indentOld + "[" ;
			}
			for (var k=0;k <obj.length;k++)
			{
				str += indent + myJSONStringify(obj[k],indent) + ",";
			}
			str = str.substring(0,str.length-1); // remove last comma
			if(level !== 0)
				str += newline +indentOld +"]";
		}
		else 
		{
			// leave brackets for first level. but must remember type (object / array ) in calling function then.
			if(level !== 0)
				str += "" + '[' + " ";
			for (var k=0;k <obj.length;k++) // is actually only one
			{
				str += myJSONStringify(obj[k],indent,1) + ",";
			}
			str = str.substring(0,str.length-1);
			if(level !== 0)
				str += "" + ']';

		}
	}
	else if (obj instanceof Object)
	{
	    len = Object.getOwnPropertyNames(obj).length;
		// always line breaks for objects
		if(len == 0)
		{
			str += "{}";
			//str += newline;
		}
		else
		{
			if(level !== 0)
			{
				indent += "\t";
				str += newline + indentOld + "{" +newline ;
			}

// 			str += newline;
// 			str +=  indentOld + "{";
// 			indent += "\t";
			var nitems = Object.getOwnPropertyNames(obj).length;
			var count=0;
			for (var k in obj)
			{
				if( typeof obj[k] === "function")
					continue;
				count++;
				str += (count!=1?newline:"") +indent + k + ":" + myJSONStringify(obj[k],indent,1) + ",";
			}
			str = str.substring(0,str.length-1);
			//str += newline;
			if(level !== 0)
				str += newline +indentOld +"}";
		}
		/*
		else
		{
			str += "" + "{" + " ";
			for (var k in obj) // is actually only one
			{
				str += k + ":" + myJSONStringify(obj[k],indent) + ",";
			}
			str = str.substring(0,str.length-1);
			str += " " + '}';
		}
		*/
	}
	else if (typeof(obj) == 'string')
	{
		str = "\"" + obj.toString().replace(/\n/g, " ").replace(/\"/g, '\\"')   + "\"";
	}
	else if (typeof(obj) == 'number')
	{
			str = obj.toString();
	}
	else if (typeof(obj) == 'boolean')  // make bools numbers
	{
			str = (obj*1).toString();
	}

	
	//console.log(obj);
	return str;

}


function KFormTester()
{
	var templateform =
    { 
      tag: "FORM",
      name : "my first reading form  #666",
      editor : "mr. X",
      lastchange : "jan2016",
      layout:
      [ 
		  { type: 'formarray',  name:"otherarray", title:'mysubform', createbutton:'Add new item',  
							 layout: 
							 [
							   { type: 'markerpoint',  name:"mypoint", title: "",
							     'form':{ 
							       name:"pointreading", title:'mysubform',
							       layout:[
                                            {type: 'option', name:"myoption",  title: "some option", 
                                            style:"radio vert", 
                                            tooltip:"here give some help",
                                            choices: ["sure","not so sure", "maybe"], 
                                            ids: ["0","1","2"] , 
                                            defaultval:"" 
                                            }
                                      ]
							     }
							     
							   }							    
							 ]
		  },
          { type: '__markerpoint',  name:"superpoint",   title: "Markerpoint fixed" },
          { type: 'option', name:"myoption",  title: "some option", 
                          style:"radio", 
                          tooltip:"here give some help",
                          choices: ["never","always", "maybe"], 
                          ids: ["0","1","2"] , 
                          defaultval:"1" },
          { type: 'option', name:"myoption2", title: "more options", 
                          style:"radio vert",
                          choices: ["Multiple Sclerosis","Schizophrenia","no idea"], 
                          ids: ["0","1","2"] , 
                          defaultval:"1" },

          { type: 'rating',  name:"myrate",   title: "tumor grading", 
                          ratings:['low','med','high','severe'],                                 
                          items:['CC','IFO','AF','OR','SLF'],
                          defaultval:['low','low','med','high','low']},
          { type: 'separator'},
          { type: 'placeholder', id: "markers" },
          { type: 'input',  name:"myinput",   title: "some text",  
                          defaultval: "good"},
          { type: 'input',  data: ['integer',0,10] , name:"myint",   title: "some number",  
                          defaultval: "410"},
          { type: 'input',  data: ['integer',0,10] , style:'slider', name:"myint2",   title: "some slider",  
                          defaultval: "0"},
          { type: 'option', name:"myoption3", title: "Select some", 
                          choices: ["Cold coffe","Politics","Beach","Pizza"], 
                          ids: ["0","1","2","3"] , 
                          defaultval:"0" },
          { type: 'check',  name:"mycheck",   title: "checkbox!", defaultval:true },
       ]
    } 
	
	//KFormTester.content = KFormTester.content || KForm.getFormContent(templateform, {});
	KFormTester.content =  KForm.getFormContent(templateform, {});

	var $p1 = dialog_generic();    $p1.$frame.show().width(300).css('left', 400);
	var $p2 = dialog_generic();    $p2.$frame.show().width(300).css('left', 10);
    
	// first form
    KForm.createForm(templateform, KFormTester.content, $p2.$container,  function($c){console.log("Onchange function: p1----------");console.log($c)});

	// second form
    KForm.createForm(templateform, KFormTester.content, $p1.$container,  function($c){console.log("Onchange function: p2----------");console.log($c)});

var that = new Object();
that.$p1 = $p1;
that.$p2 = $p2;




$($p2.$container).bind('destroyed', function() 
{
  	console.log("afr");
})

return that;
}
KFormTester.content = {};


/***************************************************************************************
*  Allow a remove handler to jQuery objects.
Set with $obj.bind('destroyed', function() {});
****************************************************************************************/
/*
(function($){
  $.event.special.destroyed = {
    remove: function(o) {
      if (o.handler) {
        o.handler()
      }
    }
  }
})(jQuery)
*/


/***************************************************************************************
*  Template example objects for copy and past
****************************************************************************************/
KForm.templates = function()
{
	templates = new Object();
	
	templates.basis = 
	{ 
	  tag: "FORM",
	  name : "untitled",
	  editor : "nora",
	  lastchange : "jan2016",
	  layout: [  ]
	}

	templates.subbform =
	{ 
		type: 'formarray',  
		name:"otherarray", 
		title:'mysubform', 
		createbutton:'Add new subform',  
		layout: [ ]
	 }

	templates.markerpoint =
	{ 
		type: 'markerpoint',  
		name:"superpoint",   
		title: "Markerpoint fixed" 
	}

	templates.radio =
	{ type: 'option', name:"myoption",  title: "some option", 
					  style:"radio", 
					  tooltip:"here give some help",
					  choices: ["never","always", "maybe"], 
					  ids: ["0","1","2"] , 
					  defaultval:"1" 
	}
	
	templates.radiovert =
	{ 
		type: 'option', name:"myoption2", title: "more options", 
					  style:"radio vert",
					  choices: ["Multiple Sclerosis","Schizophrenia","no idea"], 
					  ids: ["0","1","2"] , 
					  defaultval:"1" 
	}

	templates.rating =
	{ 
		type: 'rating',  name:"myrate",   title: "tumor grading", 
					  ratings:['low','med','high','severe'],                                 
					  items:['CC','IFO','AF','OR','SLF'],
					  defaultval:['low','low','med','high','severe']
	}

	templates.combo =
    {
    	type: 'option', name:"myoption3", title: "Select some", 
                          choices: ["Cold coffe","Politics","Beach","Pizza"], 
                          ids: ["0","1","2","3"] , 
                          defaultval:"0" 
	}

	templates.checkbox =
    { 
    	type: 'check',  name:"mycheck",   title: "checkbox!", 
                          defaultval:true 
    } 

	templates.separator =
	{ 
		type: 'separator'
	}
     
    templates.text =
	{ 
		type: 'input',  
		name:"myinput",   
		title: "some text",  
		defaultval: "good"
	}

	templates.number =
    { 
    	type: 'input',  
    	data: ['integer',0,10] , 
    	name:"myint",   
    	title: "some number",  
		defaultval: "410"
	}

	templates.slider =
    { 
    	type: 'input',  
    	data: ['integer',0,10] , 
    	style:'slider', 
    	name:"myint2",   
    	title: "some slider",  
		defaultval: "0"
	}
	

	templates.markerset =
	{ 
		type: 'markerset',  name:"markerset", title:'markerset',
		markersettype:"pointROI",
		state:
		{
			locked:0,
			createonclick:1,
			cyclecolors:1,
			defaultradius:5,
			delSetOnPanelClose:0,
			pointROIthresh:300,
			showThroughSlice:1,
			hoverdetails:0,
			showOnAllImages:1
		},
		layout:  [	 ]
	}


	return templates;
}


KForm.PSIDForm = function()
{
  var patientForm  =  

	         {  name : "patientinfo",
	             layout:
 	               [ { type: 'css', val : [] },
					 { type: 'title', val: "Patient information", css: ["font-size","30px",'display','inline-block'] },
					 { type: 'title', element:'span', val: "<p class='createbutton'> </p>", css: ["font-size","30px",'display','inline-block'] },
					 { type: 'separator', css: ["height","5px"] },
					 { type: 'form',  name: "PatientsName",   
							 layout: [{ type: 'css', val : [] },
									  { type: 'title', val: "Patients name", css: ["font-size","20px"] },
									  { type: 'input',  name:"GivenName",   title: "Given name",  
											 defaultval: ""},
									  { type: 'input',  name:"FamilyName",   title: "Family name",  
											 defaultval: ""},
							 ] },
					 { type: 'input', name:"PatientID",   title: "Patients ID",  
							 defaultval: "", attribute: "readonly"},
					 { type: 'separator', css: ["height","5px"] },

					 { type: 'option', name:"PatientsSex",  title: "Sex", 
							 style:"radio vert", 
							 choices: ["Male","Female"], 
							 ids: ["M","F"] , 
							 defaultval:"" },
					 { type: 'input', name:"PatientsBirthDate", title: "Birthdate",  
							 defaultval: ""},
					 { type: 'input', name:"PatientsAge",   title: "Age",  
							 defaultval: ""},
					 { type: 'input', name:"PatientsWeight",   title: "Weight",  
							 defaultval: ""},
					 { type: 'input', name:"PatientsSize",   title: "Size",  
							 defaultval: ""}

					 ]
	         };
	var studyForm = 
	         { name : "studyinfo",
	             layout:
 	               [ { type: 'css', val : [] },
					 { type: 'title', val: "Study information", css: ["font-size","30px"] },
					 { type: 'title', element:'span', val: "<p class='createbutton'> </p>", css: ["font-size","30px",'display','inline-block'] },					 
					 { type: 'separator', css: ["height","5px"] },
					 { type: 'input', name:"StudyID",   title: "Studys ID",  
							 defaultval: ""},
					 { type: 'input', name:"StudyDescription", title: "Description",  
							 defaultval: ""},
					 { type: 'input', name:"StudyInstanceUID", title: "Instance UID",  
							 defaultval: ""},
					 { type: 'input', name:"StudyDate", data: ['integer'],  title: "Date",  
							 defaultval: ""},
					 { type: 'input', name:"StudyTime",   title: "Time",  
							 defaultval: ""},

					 ]

	         };
	
	psidform = {name:'patientstudyinfo',layout: patientForm.layout.concat( [{ type: 'separator', css: ["height","5px"] }]).concat(studyForm.layout)}
	var out = [patientForm, studyForm, psidform ];
	return out;

}     








function jsonTable_EditorTest()
{
	
	function whenloaded(res)
	{
		for(var k in res)
		{
			jsonTable_Editor(res[k], {} );
		}
	}
	//jsonTable_loadFormattedList('form', whenloaded);
		var tabs =
		[
			{ 
				type: "jscode",
				tabid: "jscode",
				defaultcontent: "console.log('hello nora')",
				evalbutton:
				{
					buttontitle: "run code",
					callback: function(tabid, jsoneditor){ }
				}
			},
			{ 
				tabid: "viewer.autoloaders",
				defaultcontent: [],
			},
			{ 
				tabid: "layout",
				title: "form",
				defaultcontent: "console.log('hello nora')",
				evalbutton:
				{
					buttontitle: "run code",
					callback: function(tabid, jsoneditor){ console.log(jsoneditor)}
				}
			},
			{ 
				title: "reading_template",
				defaultcontent:  KReadingTool_templateDefintion(),
			}
		]

	jsonTable_Editor({id: "new", type: 'form', content:{name: "newad", id:"new"}}, tabs );

}


/***************************************************************************************
jsonTable_Editor: A popup window to edit elements from the json table. (forms, readings, settings, macros ...)
****************************************************************************************/
function jsonTable_Editor(jsonrow, tabs, options )
{
	/***************************************************************************************
	jsonrow basis object
	****************************************************************************************/
	if(jsonrow == undefined)
		jsonrow = {id:"new" , type: 'none' };

	if(jsonrow.content == undefined)
		jsonrow.content = {name:"noname" , id: jsonrow.id || "new" };

	if(tabs == undefined)
		tabs = [];

	var options = 
	{
		
	}
	
	var json = jsonrow.content;

	var that = new dialog_generic();
	that.$frame.width(1050).offset({left:0, top:0} );

	that.$frame.show();

	/***************************************************************************************
	The editor + preview view
	****************************************************************************************/
	var $dummy = $("<div class='KListView'></div>").appendTo(that.$container)
	// main container
	that.$container = $("<div style='min-width:50%	;' class=''></div>").appendTo($dummy);

	/* other containers here 


	*/

  
	/***************************************************************************************
	The main dialog
	****************************************************************************************/
 	var title = "Form Designer";
	var $filemenuli = $("<li class='inactive'><a>"+title+"</a></li>").appendTo(that.$menu);

	/***************************************************************************************
	customized tabs in the main view
	****************************************************************************************/
	var TList = undefined;  // the inner tabber
	
	// a pointer to the current json editor
	var jsoneditor;

	/***************************************************************************************
	render central tabs
	****************************************************************************************/
	function render_central_tabs()
	{

		var $innerContainer = $("<div class='KListView'></div>");
		// the left list div
		that.$listDIV = $("<div></div>").appendTo($innerContainer);
		
		// the center div with tabs etc
		var $rightDIV = $("<div class='KFlexVertical'></div>").appendTo($innerContainer);

		// title and so on
		var $tDIV = $("<div style='background:hsl(0, 0%,16%);display:flex;flex-wrap:wrap;'></div>").appendTo($rightDIV);
		
		// top bar in center tab div: name, id, delete, save, and other functions
		var $tools = $("<div class='modernbuttongroup' style=''></div>").appendTo($tDIV);
		var $nametab = $("<div class='' style='padding:15px; font-size:18px; font-weight:bold'></div>").appendTo($tools);
		
		var $name = $("<span>"+ (json.name || "noname" ) +"<span>").appendTo($nametab);
		var $modified = $("<span>" + (json.modified===true?"*":"") + "<span>").appendTo($nametab);

		var $temp = $("<span style='font-size:15px'> ( id " + json.id +")<span>").appendTo($nametab);

		makeEditableOnDoubleClick($name, function()
		{ 
			json.name = $name.text().replace("\n", "");
			renderInnerContent(); 
		});
		var $delete = $("<div class='modernbutton small red'><i class='fa fa-trash'></i>delete</div>").appendTo($tools).click( function(){deleteObject()}  );
		var $save   = $("<div class='modernbutton small green'><i class='fa fa-save'></i>save</div>").appendTo($tools).click( function(){saveObject()}  );

		// the editor content
		var $cDIVupper = $("<div style='background:hsl(0, 0%,16%);' class=''></div>").appendTo($rightDIV);
		var $cDIVLower = $("<div class='' style='position:relative;'></div>").appendTo($rightDIV);



		/////// viewer List and so on
		TList = TList || KList({ $targetcontainer:$cDIVLower, classes:["horizontal", "roundish"]   });
		TList.activeID = TList.activeID || "root";
		TList.settarget($cDIVLower)
		TList.clear();
		TList.$ul.appendTo( $cDIVupper );

		/*****************  the general tab *****************/
		var tab_general = 
		{ 
			layout: 
			[
			 { type: 'title', val: "General Properties of this form"}
				,{name:"name"  			, type: 'input',     defaultval:"untitled"  }
				,{name:"project"		, type: 'input',     defaultval:""  }
				,{name:"rights"   	    , type: 'option',  style:"",  choices: ["private", "readable", "read/writable" ]}
			]
		}

		/*****************************************************
		if nothing specified, render only the json itself
		*****************************************************/		
		if(tabs.length == 0)
		{
			tabs.unshift (
			{
				tabid: "raw",
				defaultcontent: {},
			});
		}

		
		/*****************************************************
		additionaly, always add a formatted general tab 
		*****************************************************/		
		tabs.unshift(
		{
			tabid: "general",
			form: tab_general,
			parseonblur: true,
			defaultcontent: {},
		});

		
				
		//for(var k in tabs)
		var tabmap = {};
		for(var k=0; k<tabs.length; k++)
		{
			TList.append( tabs[k].tabid,  tabs[k].title || tabs[k].tabid , 	 tabs[k].fun || renderInnerContent);
			tabmap[tabs[k].tabid] = k;
		}

		TList.updateOrSelectByID('general');
		
		 
		/*****************************************************
		render a sub tab, and return the corresponding div element
		*****************************************************/		
		function renderInnerContent(tabid)
		{
			var $tabDIV = $("<div class='' style='position:absolute;width:100%;height:100%;'></div>");// the 100 percents are important here
			var tabobj = tabs[tabmap[tabid]];
			

			if(tabid == 'general' || tabid == 'raw' )
			{
				var subjson = jsonrow;
				tabid = "content";
			}
			else
			{
				var subjson = getPropByString(json, tabid )
				// create the sub-object, if not exists
				if( subjson[tabid] == undefined && tabobj.defaultcontent )
						subjson[tabid] = tabobj.defaultcontent;
			}

			// if a formular is given render as form, otherwise, render as raw jsoneditor
			if(tabobj.form_________)
			{
				KForm.createForm(tabobj.form, subjson[tabid], $tabDIV, function(){json.modified=true;}) ;
				jsoneditor = undefined;
			}
			else
			{
				jsoneditor = new KJSONEditor(subjson, tabid,  { parseonblur:tabobj.parseonblur, type: tabobj.type });
				$tabDIV.append(jsoneditor.$container);
				if(tabobj.evalbutton && tabobj.evalbutton.callback)
				{
					var $preview= $("<div class='modernbutton small green' style='position:absolute;top:0;right:10px'> "+ ( tabobj.evalbutton.buttontitle || "run code") +"<i class='fa fa-arrow-right'></i></div>");
						$preview.click(function(){ jsoneditor.JSONparse(true); if(tabobj.evalbutton.callback){ tabobj.evalbutton.callback(tabid, jsoneditor)} }).appendTo($tabDIV);
				}
			}
			return $tabDIV;
		}

  	   that.$container.empty().append( $innerContainer );		
	   renderTemplateList();
	}
	/***************************************************************************************
	END OF render_central_tabs
	****************************************************************************************/
    



	var PList = undefined;	// the template list on left side
	var templates = KForm.templates();
	/***************************************************************************************
	renderTemplateList
	****************************************************************************************/
	function renderTemplateList()
	{	
		PList = PList || new KList({ classes:["vertical", "classic" ,"inverted"] });
		PList.clear();
		$("<div class='placeholder small' style='text-align:center;font-size:17px;padding:3px;'> Template Elements </div>")
		.click( function(){copyElement()}).appendTo(PList.$ul);

		PList.$ul.appendTo( that.$listDIV );
		for(var id in templates)
		{
			var $e = PList.append(id, id, undefined, function(id){return function(){template_copyCode(id)}}(id));
			$("<span class='flexright'></span>").appendTo($e)
				.append($("<i class='fa fa-arrow-right'></i>").click( function(id){return function(ev){template_pasteCode(id); ev.stopPropagation();}}(id) )) ;
			
		}
	}

	/***************************************************************************************
	Interpret and check the reading Definition locally in preview container
	****************************************************************************************/
	that.previewForm = function()
	{
	  var temp = KForm.getFormContent(form.content);
	  that.$previewContainerInner.empty();
	  var $formdiv = KForm.createForm(form.content, temp, that.$previewContainerInner);
	  form.modified = true;
	}
 

	/***************************************************************************************
	saveObjectOnClick
	****************************************************************************************/
	function saveObjectOnClick(saveas)
	{
		if(saveas)
		{
			copyElement(activePreset);
		}
		else
		{
			saveObject(jsonrow)
		}	
	}

	/***************************************************************************************
	saveObject
	****************************************************************************************/
	function saveObject(whendone)
	{
		if(jsonrow.id == "0")
			return;
	// 		if(!form.modified)
	// 			return	

		// verify json 
		if(jsoneditor)
		{
			if(!jsoneditor.JSONparse())
			{
				alertify.error("Json in current tab could not be parsed, it must be valid before saving.")
				return false;
			}
		}
		function whendone(result)
		{
			if(result.msg=='')
			{
				alertify.success("Saved successfully.");
				jsonrow.modified = false;

				// this should be in manager ...?
				// KViewer.formManager.update();

			}
		}
		// if this is reading, tag as reading
		if(jsonrow.content.reading !=undefined && Object.getOwnPropertyNames(jsonrow.content.reading).length > 0)
		{
			jsonrow.content.tag = 'READING'
		}
		jsonTable_save({ type:jsonrow.type, id: jsonrow.id, json:jsonrow.content } , whendone);

	} 

	/***************************************************************************************
	deleteObject
	****************************************************************************************/
	function deleteObject(id)
	{
		if(id == "0" || id == "new")
			return;
		jsonTable_delete( {id:jsonrow.id}, whendone);

		function whendone(result) 
		{
			if(result.msg=='')
			{
				alertify.success("Object deleted.");
				that.$frame.remove();

				// this should be in manager ...?
				var l = KViewer.formManager.forms;
				for(var k=0;k<l.length;k++)
					if(l[k].id == jsonrow.id)
						l.splice(k,1);
				KViewer.formManager.update();
					
			}
			else
			{
				alertify.error("Could not delete Object in jsonTable");
			}
		}
	}

	/***************************************************************************************
	Templates
	****************************************************************************************/
	function template_copyCode(id)
	{
		if(jsoneditor == undefined || jsoneditor.$textarea == undefined)
			return;
		var $ta = jsoneditor.$textarea;
		var ta = $ta.get(0);
		var s = ta.selectionEnd || 0;

		var str  = "\n " + myJSONStringify( templates[id] ) + "\n";
		// must copy text with a virtual textarea
		var $temp = $("<textarea style='position:absolute; display:block;'>"+str+"</textarea>").appendTo($body).select();
		var successful = document.execCommand('copy');
		$temp.remove();
		var $notification = $("<div style='position:absolute;color:green'>code copied to clipboard. Use ctrl+v to paste.</div>").appendTo(jsoneditor.$log.empty());
		window.setTimeout(function(){ $notification.fadeOut(900, function(){$notification.remove()})}, 800);

		$ta.focus();
		ta.selectionStart = s;
		ta.selectionEnd = s; 

		// could also paste the text directly (see below, but then ctrl+z does not work.
	}

	function template_pasteCode(id)
	{
		var templates = KForm.templates();
		var str  = "" + myJSONStringify( templates[id] ) + "";
		jsoneditor.pasteText(str, 1);

	}

	// custom toggler here
	that.ontoggle = function()
	{
		if(json.modified)
		{
			alertify.confirm("There might be unsaved changes in your form. <br> If you want to save them press 'cancel' and save manually.", function(a)
			{
				if(!a) 
					return false
				else 
					that.$frame.remove();	
			});
		}
		else
		{
			that.$frame.remove();
		}
		return false;
	}

	/***************************************************************************************
	Load Items on creation
	****************************************************************************************/
	render_central_tabs();

	return that;

}
/********************************************************
END OF jsonTable_Editor
*******************************************************/



/*************************************************************
get a nested object with a.b.c.d. path
**************************************************************/
function getPropByString(obj, propString) {
    if (!propString)
        return obj;

    var prop, props = propString.split('.');

    for (var i = 0, iLen = props.length - 1; i < iLen; i++) {
        prop = props[i];

        var candidate = obj[prop];
        if (candidate !== undefined) {
            obj = candidate;
        } else {
            break;
        }
    }
    return obj[props[i]];
}


