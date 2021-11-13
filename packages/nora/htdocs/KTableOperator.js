

/** The table operator managing resizing/stickyhead/hidingcols 
 * @param {div} $div - the table
 * @param {object} initstate - initiable state if table
 * @param {logical} sortable - html-based sorting of table is possible
 */
function attachTableOperator($div, initstate, sortable)
{
    var $table = $div.find("table");
    var $head  = $div.find("thead");
    var $body  = $div.find("tbody");

    var viscol = [];
    var widths = [];

    var tstate = { 
        viscol: viscol,
        widths: widths
    };


    $table.attr("cellspacing", 0);


    initialWidthLayout();
    $div.on('scroll', stickHead);
    $head.on("contextmenu", colShowHide);


    attachResizer($head);
    attachResizer($body);

    
    if (sortable)
    {
        var $cols = $head.find("tr:last").children();
        for (var k = 0; k < $cols.length; k++)
        {
            // works best with mousedown, otherwise sizes are different
            $($cols[k]).mousedown(function(idx) {
                return function(e)
                {
                    if (!e.shiftKey && !e.ctrlKey)
                    {
                        var left = isOnSeparatorLeft(e);
                        var right = isOnSeparatorRight(e);
                        var donotsort = $(e.target).attr('preventsortable') || $(e.target).parent().attr('preventsortable'); // for check or delete or similar cells;
                        if(! (left|right|donotsort|e.button==2) )
                            sortbycolumn($cols[idx], idx)
                    }
                }
            }(k));

        }

    }    
    
    
    function sortbycolumn(target, idx)
    {
        target.sorted = (target.sorted > 0) ? -1 : 1;
        console.log(target.sorted );
        // the caret indicator
        $head.find("i.fa-caret-up").remove();
        $head.find("i.fa-caret-down").remove();
        $(target).css('position', 'relative');
        var fastyle = target.sorted==1?"fa-caret-up":"fa-caret-down";
        $("<i class='fa "+ fastyle +"' style='position:absolute;right:9px'></i>)").appendTo($(target));


        var sorted = target.sorted;
        var rows = $body.find("td:nth-child(" + (idx + 1) + ")");
        var vals = [];
        function convert(a)
        {
            var v = parseFloat(a);
            if (isNaN(v))
                return a;
            else
                return v;
        }

        for (var k = 0; k < rows.length; k++)
        {
            // should work with content directly in td, but also with subdivs (span ...)
            if( $(rows[k]).children().length > 0)
                var text =  $(rows[k]).children().eq(0).text().trim();
            else 
                var text =  $(rows[k]).text().trim();

            vals[k] = {
                val: convert(text),
                div: $(rows[k]).parent()
            };
        }

        $body.children().detach();
        vals = vals.sort(function(a, b) 
        {
            // differnet types or same val makes problems
            if( typeof(a.val) != typeof(b.val) || a.val == b.val )
                return -1;
            else
                return (a.val > b.val) ? sorted : -sorted;
        });

        for (var k = 0; k < vals.length; k++)
            $body.append($(vals[k].div));

    }


    var sfields = $div.find(".KSearchHTML");
    if (sfields.length>0)
    {
        for (var k = 0 ;k  < sfields.length; k++)
        {
            
            $(sfields[k]).on("keyup",function(e)
            {
                var index = $(e.target).parent().index();
                var rows = $body.find("td:nth-child(" + (index+1) + ")");
                var search_re = $(e.target).val().toLowerCase().split(" ");
                for (var j = 0; j < rows.length; j++)
                {
                    var str = $($(rows[j]).children()[0]).text().trim().toLowerCase();
                    var found = true;
                    for (var l = 0;l < search_re.length;l++)
                    {
                        if (str.search(search_re[l]) == -1)
                        {
                            found = false;
                            break;
                        }                        
                    }
                    if (found)
                       $(rows[j]).parent().show();
                    else
                       $(rows[j]).parent().hide();
                        
                }
                 
            });
        }
    }



    return {
        state: tstate,
        dumpWidths:dumpWidths,
        toggleColVisibility: toggleColVisibility
    };



    function dumpWidths()
    {
        var $cols = $head.find("tr:first").children();

        if ($cols.length == 0)
            return

        var twid = 0;
        for (var k = 0; k < $cols.length; k++)
        {
            var $col = $($cols[k]);
            var w = $col.width()-1;
            widths[k] = w;
        }

    }


    function initialWidthLayout()
    {
        var max_width = 250;

        $table.removeClass("tablelayoutfixed");
        var $cols = $head.find("tr:first").children();

        if ($cols.length == 0)
            return

        var twid = 0;
        for (var k = 0; k < $cols.length; k++)
        {
            var $col = $($cols[k]);
            var w = $col.width();
            w += 5;
            if (w > max_width)
                w = max_width;


            function viscol_acc(vis)
            {
                if (vis == true | vis == undefined)
                {
                    twid += w;
                    viscol.push(true);
                }
                else
                {
                    toggleColbyIdx(k);
                    viscol.push(false);
                }
            }
            // this only makes problems on different browsers
            // why do we refer here to a 'fixedwidth' attribute, but declare css-classes!??!
            if( $col.attr("fixedwidth") != undefined)
            {
                w = parseInt($col.attr("fixedwidth"))+2;
                if ($col.find("i").length > 0)
                    $col.css('text-overflow','clip');
                    
                $col.width(w);
                widths.push(NaN);
                if (initstate != undefined)
                    viscol_acc(initstate.viscol[k]);
                else
                    viscol_acc(true);

            }
            else if (initstate != undefined)
            {
                if (initstate.widths && !isNaN(initstate.widths[k]) && initstate.widths[k] != null )
                {
                    w = initstate.widths[k];
                    $col.width(w);
                    widths.push(w);
                }
                else
                {
                    $col.width(w);
                    widths.push(NaN);
                }
                viscol_acc(initstate.viscol[k]);
            }
            else
            {
                $col.width(w);
                twid += w;
                widths.push(NaN);
                viscol.push(true);
            }
        }
       
     //   $table.width(twid);  // mrc, no fixed table layout, let's think ....

        $table.addClass("tablelayoutfixed");

    }


    function stickHead(e)
    {
        //$head.css('top', e.target.scrollTop);
        $head.find("td").css('top', e.target.scrollTop);
        $head.find("tr").css('top', e.target.scrollTop);
    }


    function getTD(target)
    {
        for (var k = 0; k < 3; k++)
        {
            if (!$(target).is("td"))
                target = $(target).parent();
            else
                break;
        }
        return target;
    }


    function isOnSeparatorLeft(e)
    {
        var target = getTD(e.target);
        var off = (e.pageX - $(target).offset().left);
        if (math.abs(off) < 4)
            return true;
        else
            return false;
    }

    function isOnSeparatorRight(e)
    {
        var target = getTD(e.target);
        var off = (e.pageX - $(target).offset().left - $(target).outerWidth());
        if (math.abs(off) < 4)
            return true;
        else
            return false;
    }
    function colShowHide(e)
    {
        e.preventDefault();
        $cols = $head.find("tr:last").children();



        var menu = KContextMenu(
        function(ev) {
            var $menu = $("<ul class='menu_context'>")
            for (var k = 0; k < $cols.length; k++)
            {
                var $icons = $("<span ></span>");

                $(" <i  class='fa " + (viscol[k] ? "fa-check-square-o" : "fa-square-o") + " fa-1x'></i>").appendTo($icons);
                var colname = $($cols[k]).attr('colkey');
                if (colname != undefined)
                    if (colname.substring(0, 5) == 'META_' && state.metaindices[colname.substring(5)] != undefined)
                    {
                        $("<i onchoice='refresh_" + $($cols[k]).attr('colkey') + "' class='fa fa-refresh fa-1x'>   </i>").appendTo($icons);
                        $("<i onchoice='del_" + $($cols[k]).attr('colkey') + "' class='fa fa-trash fa-1x'>   </i>").appendTo($icons);
                    }
                if ($($cols[k]).text().trim() != "")
                    $menu.append($("<li onchoice=" + k + ">" + $($cols[k]).text() + "</li>").append($icons));
            }
            return $menu;
        },
        function(str, ev)
        {
            if (str)
            {
                if (str.substring(0, 4) == 'del_')
                {
                    var jsonString = JSON.stringify({
                        name: str.substring(9)
                    });
                    ajaxRequest('command=delMetaIndex' + '&json=' + jsonString, function(e) {
                        state.metaindices = e.metaindices;
                        refreshButton();
                    });
                }
                else if (str.substring(0, 8) == 'refresh_')
                {
                    var jsonString = JSON.stringify({
                        name: str.substring(13)
                    });

                    var pbar = KProgressBar("updateing metaindex " + str.substring(13),"fa-submit",undefined,true);

                    ajaxRequest('command=updateMetaIndex' + '&json=' + jsonString, function(e) {
                        pbar.done();
                        refreshButton();
                    });
                }
                else
                {
                    toggleColbyIdx(parseInt(str));
                    viscol[str] = !viscol[str];
                }
            }
        }, true,true);

        menu(e);

    }



    function toggleColbyIdx(idx)
    {
        var $totoggle = $table.find("td:nth-child(" + (idx + 1) + ")");
        $totoggle.toggle();
    }


    function toggleColVisibility($tr)
    {
        for (var k = 0; k < viscol.length; k++)
        {
            var $td = $tr.find("td:nth-child(" + (k + 1) + ")");
            if (viscol[k])
                $td.show();
            else
                $td.hide();
        }
    }


    function attachResizer($part)
    {

        $part.children().on("mousemove", function(e)
        {
            if (isOnSeparatorLeft(e) | isOnSeparatorRight(e))
            {
                var t = getTarget(e);
                if (t.colidx == -1)
                    return;
                var $target = $($head.find("td")[t.colidx]);
                if ($target.attr('fixedwidth') != undefined)
                    return;
         

                $part.css('cursor', 'ew-resize');
                $part.addClass('nohover');
            }
            else
            {
                $part.css('cursor', '');
                $part.removeClass('nohover');
            }
        });
        $part.children().on("mouseleave", function(e)
        {
            $part.css('cursor', '');
            $part.removeClass('nohover');
        });

        function getTarget(e)
        {

            var left = isOnSeparatorLeft(e);
            var right = isOnSeparatorRight(e);
            if (!(left | right))
                return ;

            var td = getTD(e.target);

            var $targetcol = $(td);
            if (left)
                $targetcol = $(td).prevAll(":visible:first");

            var initialWidth = $targetcol.outerWidth();
            var colidx = $targetcol.prevAll().length;
           // if (left | right)
              return {colidx:colidx,targetcol:$targetcol};
        }



        $part.children().on("mousedown", function(e)
        {
            
            var left = isOnSeparatorLeft(e);
            var right = isOnSeparatorRight(e);

            var td = getTD(e.target);

            var $targetcol = $(td);
            if (left)
                $targetcol = $(td).prevAll(":visible:first");

            var colidx = $targetcol.prevAll().length;
            
            var t = getTarget(e);
            if (t == undefined)
                return;

            var initialWidth = $(t.targetcol).outerWidth();
            var $target = $($head.find("td")[t.colidx]);

           
           // if (1) //left | right)
            {
                e.preventDefault();
                e.stopPropagation();

                if ($target.attr('fixedwidth') != undefined)
                    return;


                //var $dom = $(document.body);
                var $dom = $div;
                $dom.on("click", function() {
                    attachTableOperator.fromResizingPhase = false;
                });

                $dom.on("mouseup mouseleave", function(ev)
                {
                    ev.preventDefault();
                    ev.stopImmediatePropagation();
                    $dom.off("mouseup mousemove mouseleave")
                    attachTableOperator.fromResizingPhase = true;
                });
                $dom.on("mousemove", function(ev)
                {
                    var minwidth = 24;
                    var dif = ev.clientX - e.clientX;
                    var w = (initialWidth + dif > minwidth) ? (initialWidth + dif) : minwidth;
                   
                    $target.outerWidth(w);
                    dif = w-$target.outerWidth()
                    widths[t.colidx] = $target.width();


                    // this will set a minimum size on columns on fixed width tables ....?
                    // => removed
                    $table.width($table.width()+dif);
                  //  $table.width("");
                    // no interference with width of table ..
                });
                e.stopImmediatePropagation();
                return false;
            }

        });
    }

}


attachTableOperator.fromResizingPhase = false;
