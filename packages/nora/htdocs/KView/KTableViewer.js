



// ======================================================================================
// ======================================================================================
// ============= KTableViewer
// ======================================================================================
// ======================================================================================


function LogGamma(Z) {
	with (Math) {
		var S=1+76.18009173/Z-86.50532033/(Z+1)+24.01409822/(Z+2)-1.231739516/(Z+3)+.00120858003/(Z+4)-.00000536382/(Z+5);
		var LG= (Z-.5)*log(Z+4.5)-(Z+4.5)+log(S*2.50662827465);
	}
	return LG
}

function Betinc(X,A,B) {
	var A0=0;
	var B0=1;
	var A1=1;
	var B1=1;
	var M9=0;
	var A2=0;
	var C9;
	while (Math.abs((A1-A2)/A1)>.00001) {
		A2=A1;
		C9=-(A+M9)*(A+B+M9)*X/(A+2*M9)/(A+2*M9+1);
		A0=A1+C9*A0;
		B0=B1+C9*B0;
		M9=M9+1;
		C9=M9*(B-M9)*X/(A+2*M9-1)/(A+2*M9);
		A1=A0+C9*A1;
		B1=B0+C9*B1;
		A0=A0/B1;
		B0=B0/B1;
		A1=A1/B1;
		B1=1;
	}
	return A1/A
}

function student_t(df,X) 
{
    with (Math) {
		if (df<=0) {

		} else {
			A=df/2;
			S=A+.5;
			Z=df/(df+X*X);
			BT=exp(LogGamma(S)-LogGamma(.5)-LogGamma(A)+A*log(Z)+.5*log(1-Z));
			if (Z<(A+1)/(S+2)) {
				betacdf=BT*Betinc(Z,A,.5)
			} else {
				betacdf=1-BT*Betinc(1-Z,.5,A)
			}
			if (X<0) {
				tcdf=betacdf/2
			} else {
				tcdf=1-betacdf/2
			}
		}
		tcdf=round(tcdf*100000)/100000;
	}
    return tcdf
}

function linRegression(M,idx)
{
	var A = []
	var b = [];
	for (var k = 0; k < M.length;k++)
	{
		if (k != idx)
		{
    		b.push(M[idx][k])
			var a = []
			for (var j = 0; j < M.length;j++)
			{
                if ( j!= idx)
				    a.push(M[j][k])
			}
			A.push(a)
		}
	}
	var res = math.mdiv(math.matrix(A),math.matrix(b));
	var stats = {b:res._data[0],m:res._data[1]};

	return stats;
}

function pstats(stats,data)
{
	var err2 = 0;
	var cnt = 0;
	var m_0=0;
	var q_0=0;
	var m_1=0;
	var q_1=0;
	for (var k = 0;k < data[0].length;k++)
	{
		if (!isNaN(data[0][k] && !isNaN(data[1][k])))
		{
		   var d = data[0][k]*stats.m + stats.b - data[1][k];
		   err2 += d*d
		   m_0 += data[0][k];
		   m_1 += data[1][k];
		   q_0 += data[0][k]*data[0][k];
		   q_1 += data[1][k]*data[1][k];
		   cnt++;
		}
	}
	m_0 /= cnt;
	m_1 /= cnt;
	var s_0 = q_0/cnt - m_0*m_0;
	var s_1 = q_1/cnt - m_1*m_1;
	err2 = err2 / cnt;
    var expvar = 1-err2/s_1;
    var StErr = Math.sqrt(err2/ s_0 /(cnt-2))
    var t = stats.m/StErr

    var stats = {sdev_x:math.sqrt(s_0),sdev_y:math.sqrt(s_1),error:math.sqrt(err2), expvar:expvar ,t:t  }
    console.log(stats)
    return stats


}


function computeCorrelationMatrix(data)
{
		var xy = []
		var M = [];
		for (var k = 0; k < data.length+1;k++)
		{
		    var m = [];
			for (var j = 0; j < data.length+1;j++)
			    m.push(0);
			M.push(m);
		}




		var x0=10000000;		    
		var x1=-10000000;		   
		var nans = 0; 
		for (var k = 0; k < data[0].length;k++)
		{
			var valid = true;
			var mean = 0;
			for (var j = 0; j < data.length;j++)
			{
			    if (isNaN(data[j][k]))			    
			        valid = false;
			}
            if (!valid)
            {
                nans++;
				continue;
            }

			for (var j = 0; j < data.length+1;j++)
    			for (var s = 0; s < data.length+1;s++)
    			{
    				if (s==0 && j==0)
    				    M[s][j]+=1.0;
    				else if (s==0)
    				    M[s][j] += data[j-1][k];
    				else if (j==0)
    				    M[s][j] += data[s-1][k]; 
    				else
    				    M[s][j] += data[s-1][k]*data[j-1][k]    				 

    			}
			
		}

   return {M:M,nans:nans}

}
function ChartPanel(sheet,title)
{

    Chart.defaults.global.defaultFontColor = 'black';
    var panel = KPanel($(document.body), "Scatter", "Chart");
	panel.$container.width(700)
    panel.$container.height(700)

    var $options = $("<div class='KchartOptions'>  </div>")
    var $statinfo = $("<div class='Kchartstats visible'>  </div>")
    $statinfo.on("mouseleave",function() {  $statinfo.removeClass("visible")})

    panel.$container.append($options)
    panel.$container.append($statinfo)

    panel.$container.addClass("Kchart")
	addCustomResizer(panel.$container, {});

    var canvas = $('<canvas class="KChartCanvas" ></canvas>')
    canvas.appendTo(panel.$container);
    var ctx = canvas[0].getContext("2d");

    var data = sheet.data;
    var colnames = sheet.columns;



    function organizeData(sheet,sels,type)
    {

		var data = sheet.data;
		var colnames = sheet.columns;
		var deselected_rows = sheet.deselected_rows

        var numerical_data = [];
        var combinatorial_dataset = undefined;

        for (var j = 0 ; j < sels.length;j++)
        {

			var min = 100000000000;
			var max = -100000000000;
            var mapkey = x => { if (x == "") return "empty"; else return x; }
            if (colnames[sels[j]].substring(0,11) == 'PatientsSex')
            {
                var tmp = mapkey;
                mapkey = x => tmp(x).replace("W","F")
            }

        	var combinatorial = type[sels[j]]==2;

			var d = []
			var dn = []
			var l = [];
			var uniset = {}
			for (var k = 0; k < data.length;k++)
			{
                if (deselected_rows[k])
                    continue;	
                l.push(data[k][0])		
				var v = data[k][sels[j]];
				if (combinatorial == true )
				{
					var vk = mapkey(v)
				    if (uniset[vk] == undefined)
				    {
						uniset[vk] = true;
						if (Object.keys(uniset).length> 5)
							combinatorial = false;
				    }
				    dn.push(vk);
				}
				    
				v = parseFloat(v)
				d.push(v)
			    if (!isNaN(v) & v != Infinity & v != -Infinity)
				{
					if (min > v) min = v;
					if (max < v) max = v;
				}
			}
			if (combinatorial)
			    combinatorial_dataset = {data:dn,uniset:uniset,name:colnames[sels[j]],max:max,min:min};
			else
			    numerical_data.push({numerical_data:d,name:colnames[sels[j]],max:max,min:min,ids:l});
        }

        return {numerical_data:numerical_data,combinatorial_dataset:combinatorial_dataset  }
    }

    function addStatinfo(obj)
    {
        var x = "<div> <div> " +  obj.name ;
        for (var k = 0; k < obj.length;k++)
            x += " </div> <div> " + obj[k]
        x += "</div></div>";
        $statinfo.append($(x))
    }



    function initPlot(x)
    {
 	    $options.append(x.$options)
        $statinfo.children().remove();
    	
    }

    function addOption(which,visname,id,def,type)
    {
    	which[id] = def;
		var $par = $("<div>"+visname+" <input value='"+def+"' id='"+id+"' type='"+type+"'> </div>")
		if (type == "checkbox" & def)
		    $par.find("input").attr("checked",1)

		$par.find("input").on("change",function(e)
		{
			if (type == "checkbox")
               which[id] = e.target.checked;
			else
			   which[id] = e.target.value;
            which.update(e)
		})
		which.$options.append($par)

    }


	function fix(x,order)
	{
		if (Math.abs(order) > 3)
			return x.toFixed(1) + "e" + order;
		else
		{
			if (x==undefined)
			    return "undefined"
			if (order > 0)
				return ""+ (x).toFixed(1);
			else
				return ""+ (x).toFixed(-order+1);
		}
	}


    /**************************************************************
    * ScatterPlot
    **************************************************************/


    function scatterPlot(sels,type)
    {

        initPlot(scatterPlot)
        scatterPlot.update = function(e)
		{
		    scatterPlot(sels,type)
		}


        var {numerical_data,combinatorial_dataset} = organizeData(sheet,sels,type)

        
        var ndata = numerical_data.map((x) => x.numerical_data);
        var {M,nans} = computeCorrelationMatrix(ndata)

        var stat = linRegression(M,2)
        console.log(stat)
        
        var pstat = pstats(stat,ndata)


		var txt = ['sdev('+numerical_data[0].name+'): ' + pstat.sdev_x.toFixed(2),
				   'sdev('+numerical_data[1].name+'): ' + pstat.sdev_y.toFixed(2),
				   'error:'+pstat.error,
				   'explained var.:'+pstat.expvar,
				   't:'+pstat.t 
				   ]
		txt.name = 'lin. regression'
		addStatinfo(txt);



		var xy = ndata[0].map(function(e, i) {
		  return {x:e, y:ndata[1][i]};
		});

		var xlabel = numerical_data[0].name
		var ylabel = numerical_data[1].name
        var min = numerical_data[0].min;
        var max = numerical_data[0].max;


		if (panel.currentChart != undefined)
            panel.currentChart.destroy();

		panel.currentChart = new Chart(ctx, {
			data: {
				datasets: [{
					type:'scatter',
					label: title,
					pointBackgroundColor: 'rgba(0,0,0,255)',					

					data: xy
				},{
					type:'line',
					label: "linear fit",
					borderColor:"rgba(255,128,128,0.5)",
					pointColor: 'rgba(0,255,0,1)',					
					fill:false,
					data: [{x:min,y:stat.m*min+stat.b},{x:max,y:stat.m*max+stat.b}],
				}
				]
			},
			options: {
				tooltips: {
						 callbacks: {
							label: function(tooltipItem, data) {
							   return "PSID: "+ numerical_data[0].ids[tooltipItem.index]
							}
						 }
					  },				
				maintainAspectRatio:false,
				scales: {
					xAxes: [{
						type: 'linear',
						position: 'bottom',
						  scaleLabel: {
							display: true,
							labelString: xlabel
						  }
					}],
					yAxes: [{
						type: 'linear',
						position: 'left',
						  scaleLabel: {
							display: true,
							labelString: ylabel
						  }
					}]
				}
			}
		});
    }
    panel.scatterPlot = scatterPlot



    /**************************************************************
    * PRgraph
    **************************************************************/


    PRgraph.$options = $("<div>")
    addOption(PRgraph,"ROC ","ROC",0,"checkbox")
    function PRgraph(sels,type)
    {
        initPlot(PRgraph)
        PRgraph.update = function(e)
		{
		    PRgraph(sels,type)
		}


        var {numerical_data,combinatorial_dataset,max,min} = organizeData(sheet,sels,type)

        var datasets = []
        for (var k = 0; k < numerical_data.length;k++)
        {
            var ndata = numerical_data[k].numerical_data;
            var cdata = combinatorial_dataset.data
            var tup = []
            for (var j = 0;j < ndata.length;j++)            
            	tup.push({n:ndata[j],c:parseInt(cdata[j])});
            //	tup.push({n:Math.random(),c:parseInt(cdata[j])});
            tup = tup.sort(function(x,y) { return y.n-x.n })
            var cumsum = tup.map((x) => x.c);
            for (var j = 1; j < cumsum.length;j++)
                cumsum[j] += cumsum[j-1];

            var xy = [];
            var N = cumsum.length
            var toton = cumsum[N-1]
            var acc_max = 0;
            var max_th;
            var acc_05 = 0;
            var lastx = 0;
            var AUC = 0;
            var x,y;
			for (var j = 0; j < N;j++)
            {
            	if (PRgraph.ROC)
            	{
            	     x = (j+1-cumsum[j])/(N-toton);
            	     y = cumsum[j]/toton;
            	}
            	else
            	{
            		x = cumsum[j]/(j+1)
            		y = cumsum[j]/toton
            	}
                xy.push({y:y,x:x})
                AUC += y*(x-lastx);
                lastx = x;



                var acc = (cumsum[j] + (N-j)-(toton-cumsum[j]))/N
                if (acc > acc_max)
                {
                	acc_max = acc;
                	max_th = tup[j].n;
                }
                if (tup[j].n > 0.5)
                    acc_05 = acc;
            }
            AUC += (1-lastx)*y;
			if (PRgraph.ROC)            
                xy.push({y:1,x:1})            
            else
            {
                xy.push({y:1,x:0})            
                AUC = 1-AUC;
            }


            var txt = ['accuracy@50%: ' + acc_05.toFixed(2),
                       'accuracy(max): ' + acc_max.toFixed(2) + "@" + Math.round(100*max_th)+"%" ,
                       'balance: ' + (100-100*toton/N).toFixed(2) + "%",
                       "AUC: " + AUC.toFixed(2)
                       ]
            txt.name = numerical_data[k].name;
            addStatinfo(txt);

            datasets.push(           
             {
					type:'line',
					label: numerical_data[k].name,
					borderColor:(new KColor(KColor.list[k])).getCSS(),					
					fill:true,
					data: xy
				});



        }
        datasets.push(        
                {
					type:'line',
					label: "baseline",
					borderColor:"rgba(0,0,128,0.5)",
					pointColor: 'rgba(0,0,0,0)',					
					fill:false,
					data: PRgraph.ROC?[{x:0,y:0},{x:1,y:1}]:[{x:toton/N,y:0},{x:toton/N,y:1}]
				})


		if (panel.currentChart != undefined)
            panel.currentChart.destroy();

		panel.currentChart = new Chart(ctx, {
			data: {
				datasets: datasets
			},
			options: {
				maintainAspectRatio:false,
				scales: {
					xAxes: [{
						type: 'linear',
						position: 'bottom',
						  scaleLabel: {
							display: true,
							labelString: PRgraph.ROC?"FP (1-specificity)":"precision (1-FP)"
						  }
					}],
					yAxes: [{
						type: 'linear',
						position: 'left',
						  scaleLabel: {
							display: true,
							labelString: PRgraph.ROC?"TP (sensitivity)":"recall (TP)"
						  }
					}]
				}
			}
		});

    }
    panel.PRgraph = PRgraph



    /**************************************************************
    * Histogram
    **************************************************************/


    histogram.$options = $("<div>")
    addOption(histogram,"#bins:","numberofbins",20,"number")
    addOption(histogram,"normalized:","normalized",1,"checkbox")

    function histogram(sels,type)
    {
        initPlot(histogram)
        histogram.update = function(e)
		{
		    histogram(sels,type)
		}


        var {numerical_data,combinatorial_dataset} = organizeData(sheet,sels,type)

        var max = math.max(numerical_data.map(x => x.max))
        var min = math.min(numerical_data.map(x => x.min))

        var n = histogram.numberofbins;
        if (!(n>1 & n < 1000))
            n = 20;
        var datasets = []
        var dset_tpm =  {
        	fill:false,
        	borderWidth:1,
        }
        var del = max-min;
        min = min - 0.02 * del;
        max = max + 0.02 * del;
        var cols = []
        var cnt = 0;
        var sets = []
        for (var j = 0 ; j < numerical_data.length;j++)
        {
           function addhisto(num_data,name,idx)
           {
			   var histo = comphisto(min,max, n, num_data, num_data.length, num_data.length,histogram.normalized=="1")
			   datasets.push($.extend({
					 label:name,
					 data:histo.accus,
					 backgroundColor:(new KColor(KColor.list[cnt])).getCSS()
				   },dset_tpm) ) 	   
			   cnt++;

               var mean = 0
               var nancnt = 0
               for (var k =0;k < num_data.length;k++)
               {    
                    if (isNaN(num_data[k]) | num_data[k] == Infinity | num_data[k] == -Infinity)
                        nancnt++;
                    else
                        mean += num_data[k];
                        
               }
               mean /= (num_data.length-nancnt);
               var sdev = 0;
               for (var k =0;k < num_data.length;k++)
                    if (!(isNaN(num_data[k]) | num_data[k] == Infinity | num_data[k] == -Infinity))
                        sdev += (num_data[k]-mean)*(num_data[k]-mean);
               sdev = Math.sqrt(sdev / (num_data.length-1-nancnt));

               var sorted = num_data.sort();
               var p50 = sorted[Math.round(num_data.length/2)];
               var p95 = sorted[Math.round(num_data.length*0.95)];
               var p05 = sorted[Math.round(num_data.length*0.05)];
               var order = Math.floor(Math.log10(sdev*2));

               var nanstr="</div> <div> #samples: " + num_data.length;
               if (nancnt >0)
                nanstr = nanstr + " nans/inf:"+nancnt;

                sets.push({mean:mean,sdev:sdev,n:num_data.length,name:name })


               $statinfo.append($("<div> <div> " +  name 
               +" </div> <div> mean: "+fix(mean,order)
               +" </div> <div> sdev: "+fix(sdev,order) 
               +" </div> <div> p%(5,50,95): "+fix(p05,order)+", "+fix(p50,order)+", "+fix(p95,order)
               +nanstr
               +"</div></div>"))

           }


            


           if (combinatorial_dataset != undefined)
           {
			   var num_data = numerical_data[j].numerical_data;  
			   var cdata = combinatorial_dataset.data;         	
               for (var k in combinatorial_dataset.uniset)
               {
                    var ndata = []
                    for (var s = 0; s < num_data.length;s++)
                    {
                    	if (cdata[s] == k)
                    	{
                    		ndata.push(num_data[s])
                    	}
                    }
				    var num_data = numerical_data[j].numerical_data;
				    addhisto(ndata,"<" + combinatorial_dataset.name+"="+k + "> " + numerical_data[j].name)

               }
           }
           else
           {
			   var num_data = numerical_data[j].numerical_data;
			   addhisto(num_data,numerical_data[j].name)
           }

           if (sets.length == 2)
           {
               var a = sets[0];
               var b = sets[1]
               var s2 = Math.sqrt((a.sdev*a.sdev*(a.n-1) + b.sdev*b.sdev*(b.n-1))/(b.n+b.n-2))
               var t = (a.mean - b.mean) / s2
               t *= Math.sqrt(a.n*b.n/ (a.n+b.n))
               var p = 1-student_t(a.n+b.n-2,Math.abs(t));
               var res = ", p=" + p.toFixed(3);
               $statinfo.append($("<div> <div> T-test: " +sets[0].name +" vs "+sets[1].name
               +" </div> <div> t: "+t.toFixed(3)+res
               +"</div></div>"))


           }

        }
    	

        var order = Math.floor(Math.log10(max-min));

        var yd = [];
        for (var k = 0; k < n; k++ )
        { 
           var v = min + (max-min)*((k+0.5)/n);
           yd.push(fix(v,order))
        }

        if (panel.currentChart != undefined)
            panel.currentChart.destroy();

		panel.currentChart = new Chart(ctx,
		  {"type":"bar",
           "data":{
   	                 "labels":yd,
   	                 "datasets":datasets },
   	        "options":{
					maintainAspectRatio:false,
   	               	"scales":{"yAxes":[{
   	               		    ticks:{"beginAtZero":true},
						    scaleLabel: {
							   display: true,
						       labelString: histogram.normalized=="1"?("percent (%)"):"frequency/counts"
						     }

   	               		    }
   	               		    ]

   	               		}}});
    }
    panel.histogram = histogram

    return panel

}




function KTableViewer(viewport, master)
{
  /**  @class A table viewer for csv-files
   *  @alias KTableViewer 
   *  @augments KPrototypeViewer */

  var that = KPrototypeViewer(viewport, master);
  that.viewerType = 'tableViewer';
  var toolbar = that.toolbar
 

  var $div;
  var $table;

  var data;
  var colnames;
  var selections;
  var sheet;
  var fobj;
  var deselected_rows;


  that.setContent = setContent;
  function setContent(ev)
  {

    fobj = ev
	if ($div != undefined)
		$div.remove();

    data = []
    colnames = [];
    selections = {}
	deselected_rows = {}

    sheet = { data : data, columns : colnames, deselected_rows:deselected_rows}




	$div = $("<div class='KViewPort_tableViewer_outerDiv'>").appendTo(that.$container);
	$table =  $("<table class='KViewPort_tableViewer' ></table>").appendTo($div);


  	that.viewport.progressSpinner("rendering table");
	that.prepViewer(ev);
	$div.show();
	$table.children().remove();

	viewport.setCurrentViewer(that);
	var str = ev.content;

    if (str == undefined)
    {
    	that.viewport.progressSpinner(undefined)
    	alertify.error("sorry, no content found in csv!!");
    	that.viewport.kill();
    	return;
    }

	lines = str.split("\n");
	var $head = $("<thead>")
	var $body = $("<tbody>")
	var $colg = $("<colgroup>");

	var header = true;

	var nate = [];
	var header_lines=0


	lines.chunk( function(line,k)
		{
			if (line == "")
				return;

			var entries = line.split(";");
			var $row = $("<tr></tr>");


			if (k>0 & entries[0] != "")
			   header=false;
			if (header)
			{
				header_lines++;
				$row.appendTo($head);
				$row.on('click',function(e)
				{
					var col = $(e.target).parent().children().index($(e.target));
					var c = $($colg.children()[col])
					if (col == 0)
					    return;
					if (e.shiftKey)
					{
						if (c.hasClass("tabcolselected"))
						{
						    c.removeClass("tabcolselected")
						    c.removeClass("tabcolselectedALT")						    
						    delete selections[col] 
						}
						else
						{
						    c.addClass("tabcolselected")
						    selections[col] = 2;
						}
					}
					if (e.ctrlKey)
					{
						if (c.hasClass("tabcolselectedALT"))
						{
						    c.removeClass("tabcolselected")
						    c.removeClass("tabcolselectedALT")
						    delete selections[col] 
						}
						else
						{
						    c.addClass("tabcolselectedALT")
						    selections[col] = 1;
						}
					}
				});
			}
			else
			{
				$row.attr("row",k-header_lines)
				$row.appendTo($body);
				$row.on('click',function(e)
				{
                    var $x = $(e.currentTarget);
                    if (e.shiftKey)
                    {
						var i = $x.attr('row');
						if (!deselected_rows[i])
                            $x = $x.prevUntil(".excluded").add($x);
                        else
                            $x = $x.prevUntil(":not(.excluded)").add($x);
                    }

					for (var j = 0; j < $x.length;j++)
					{
						var i = $($x[j]).attr('row');


						if (deselected_rows[i])
						{
							delete deselected_rows[i];
							$($x[j]).removeClass('excluded')
						}
						else
						{
							deselected_rows[i] = true;
							$($x[j]).addClass('excluded')
						}

					}

				});

			}

            var r = [];
            var last = "";
			for (var j = 0; j < entries.length;j++)
			{
				if (k==0)
				{
					$colg.append($("<col>"));
					if (entries[j] == "")
					{
					    colnames[j] = last;
					    nate[j] = false
					}
					else
					{                        
                        colnames[j] = entries[j];
                        last = entries[j];
					    nate[j] = true
					}
				}
				else if (header)
				{
					if (entries[j] != "")
					{
				    	last = entries[j];
    					colnames[j] += "." +  last
				    	nate[j] = true;
					}	
					else
					{
					    if (!nate[j])	
							colnames[j] += "." +  last
    
					}

				}

				if (!header)
				    r.push(entries[j])


	//			var $span = $("<span> "+entries[j]+"</span>");
//				$row.append($("<td></td>").append($span));		    
				$row.append($("<td>"+entries[j]+"</td>"));		    
			}
			if (r.length > 0)
			    data.push(r)


		},5,1,function(i) {
		that.viewport.progressSpinner("rendering table " + Math.round(100*i/lines.length) + "%");} ,
		function() {

			$table.append($colg);
			$table.append($head);
			$table.append($body);
			attachTableOperator($div,undefined,true);	
			$table.show();
			that.setInnerLayout();
			that.viewport.progressSpinner(undefined)} );

	
  }



  that.detachContent = detachContent;
  var scrollTop = 0;
  var scrollLeft = 0;
  function detachContent()
  {
    scrollTop = $div.scrollTop();
    scrollLeft = $div.scrollLeft();
  }

  function setInnerLayout()
  {
  	that.setInnerLayout_parent();
	$div.scrollTop(scrollTop);
	$div.scrollLeft(scrollLeft);
  }
  that.setInnerLayout = setInnerLayout;


  toolbar.$histo = $("<div class='KViewPort_tool'><i class='fa fa-bar-chart fa-1x'></i></div>")
        .click(function() { 
            var cpanel = ChartPanel(sheet ,fobj.filename)
			cpanel.histogram(Object.keys(selections),selections);

         });

  toolbar.$scatter = $("<div class='KViewPort_tool'><i class='fa fa-area-chart fa-1x'></i></div>")
        .click(function() { 
            var cpanel = ChartPanel(sheet ,fobj.filename)
			cpanel.scatterPlot(Object.keys(selections),selections);

         });
  toolbar.$pr = $("<div class='KViewPort_tool'><i class='fa fa-1x'>PR</i></div>")
        .click(function() { 
            var cpanel = ChartPanel(sheet ,fobj.filename)
			cpanel.PRgraph(Object.keys(selections),selections);

         });

  toolbar.$download = $("<div class='KViewPort_tool'><i class='fa fa-download fa-1x'></i></div>")
        .click(function() { 
        that;
			initiateDownload(that.content.content, projectInfo.name + "_meta.csv");		
         });
     


  toolbar.attach(toolbar.$download);
  toolbar.attach(toolbar.$histo);
  toolbar.attach(toolbar.$scatter);
  toolbar.attach(toolbar.$pr);





  return that;

}



