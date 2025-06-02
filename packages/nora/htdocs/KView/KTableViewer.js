



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

var jsstats=jsstats||{};!function(jss){var NormalDistribution=function(t,i){t||(t=0),i||(i=1),this.mean=t,this.sd=i,this.Sqrt2=1.4142135623730951,this.Sqrt2PI=2.5066282746310007,this.lnconstant=-Math.log(this.Sqrt2PI*i)};NormalDistribution.prototype.sample=function(){},NormalDistribution.prototype.cumulativeProbability=function(t){var i=(t-this.mean)/(this.Sqrt2*this.sd);return.5+.5*this.errorFunc(i)},NormalDistribution.prototype.invCumulativeProbability=function(t){return this.Sqrt2*this.invErrorFunc(2*t-1)*this.sd+this.mean},NormalDistribution.prototype.errorFunc=function(t){var i=1/(1+.5*Math.abs(t)),r=1-i*Math.exp(-t*t-1.26551223+i*(1.00002368+i*(.37409196+i*(.09678418+i*(i*(.27886807+i*(i*(1.48851587+i*(.17087277*i-.82215223))-1.13520398))-.18628806)))));return t>=0?r:-r},NormalDistribution.prototype.invErrorFunc=function(t){var i,r;if(r=0==t?0:t>0?1:-1,0!=t){var o=Math.log(1-t*t),a=o/.147,s=o/2+2/(.147*Math.PI),e=Math.sqrt(s*s-a);i=Math.sqrt(e-s)*r}else i=0;return i},jss.NormalDistribution=NormalDistribution;var TDistribution=function(t){t&&(this.df=t)};TDistribution.prototype.LogGamma=function(Z){with(Math)var S=1+76.18009173/Z-86.50532033/(Z+1)+24.01409822/(Z+2)-1.231739516/(Z+3)+.00120858003/(Z+4)-536382e-11/(Z+5),LG=(Z-.5)*log(Z+4.5)-(Z+4.5)+log(2.50662827465*S);return LG},TDistribution.prototype.Betinc=function(t,i,r){for(var o,a=0,s=1,e=1,n=1,u=0,h=0;Math.abs((e-h)/e)>1e-5;)h=e,s=n+(o=-(i+u)*(i+r+u)*t/(i+2*u)/(i+2*u+1))*s,e=(a=e+o*a)+(o=(u+=1)*(r-u)*t/(i+2*u-1)/(i+2*u))*e,a/=n=s+o*n,s/=n,e/=n,n=1;return e/i},TDistribution.prototype.cumulativeProbability=function(X,df){with(df||(df=this.df),Math)df<=0?console.error("Degrees of freedom must be positive"):(A=df/2,S=A+.5,Z=df/(df+X*X),BT=exp(this.LogGamma(S)-this.LogGamma(.5)-this.LogGamma(A)+A*log(Z)+.5*log(1-Z)),Z<(A+1)/(S+2)?betacdf=BT*this.Betinc(Z,A,.5):betacdf=1-BT*this.Betinc(1-Z,.5,A),tcdf=X<0?betacdf/2:1-betacdf/2),tcdf=round(1e5*tcdf)/1e5;return tcdf},TDistribution.prototype.invCumulativeProbability=function(t,i){i||(i=this.df);if(t>=.5){s=0;for(o=0;o<100&&!(this.cumulativeProbability(o,i)>=t);o++)s=o;for(var r=s,o=0;o<100&&!(this.cumulativeProbability(s+o/100)>=t);o+=1)r=s+o/100;for(var a=r,o=0;o<100&&!(this.cumulativeProbability(r+o/1e4)>=t);o+=1)a=r+o/1e4;return a}for(var s=0,o=0;o<100&&!(this.cumulativeProbability(-o,i)<=t);o++)s=o;for(var r=s,o=0;o<100&&!(this.cumulativeProbability(-s-o/100)<=t);o+=1)r=s+o/100;for(var a=r,o=0;o<100&&!(this.cumulativeProbability(-r-o/1e4)<=t);o+=1)a=r+o/1e4;return-a},jss.TDistribution=TDistribution;var FDistribution=function(t,i){this.df1=t,this.df2=i,this.EPSILON=1e-10};FDistribution.prototype.L504=function(t,i,r,o){var a=t*i/(t*i+r),s=Math.sqrt(a),e=Math.log(s),n=Math.sqrt(1-a),u=Math.log(n),h=1-2*Math.atan(s/Math.sqrt(-s*s+1))/Math.PI,f=0;if(1!=r){v=Math.log(2*s/Math.PI);if(h-=Math.exp(v+u),3!=r)for(var l=Math.floor((r-3)/2),b=1;b<=l;b++){M=2*b+1;(c=(f+=Math.log((M-1)/M))+u*M+v)>-78.4&&(h-=Math.exp(c))}}if(1!=t){var v=f;if(r>1&&(v+=Math.log(r-1)),(v+=Math.log(2/Math.PI)+e+u*r)>-78.4&&(h+=Math.exp(v)),3!=t){l=Math.floor((t-3)/2);f=0;for(b=1;b<=l;b++){var M=2*b+1,c=(f+=Math.log((r+M-2)/M))+e*(M-1)+v;c>-78.4&&(h+=Math.exp(c))}}}return h},FDistribution.prototype.L401=function(t,i,r,o){var a=t*i/(t*i+r),s=Math.log(a),e=0,n=Math.log(1-a)*r/2;if(n>-78.4&&(e=Math.exp(n)),2!=t)for(var u=Math.floor(t/2-1),h=0,f=1;f<=u;f++){var l=2*f;(h+=Math.log(r+l-2)-Math.log(l)+s)+n>-78.4&&(e+=Math.exp(h+n))}return 1==o&&(e=1-e),e},FDistribution.prototype.ProbF=function(t,i,r){var o=r,a=t,s=i,e=0;if(2*Math.floor(a/2)==a)return n=this.L401(a,o,s,e);if(2*Math.floor(s/2)!=s){var n=this.L504(a,o,s,e);return n}return o=1/o,a=i,s=t,e=1,this.L401(a,o,s,e)},FDistribution.prototype.cumulativeProbability=function(t){if(this.df1>.01&this.df2>.01&t>this.EPSILON)return 1-this.ProbF(this.df1,this.df2,t);console.error("df1, df2, and F must be numbers greater than 0.")},jss.FDistribution=FDistribution;var ChiSquareDistribution=function(t){this.df=t};ChiSquareDistribution.prototype.ChiSquaredProbability=function(t){var i,r,o,a,s,e,n=0,u=this.df,h=Math.log(Math.sqrt(Math.PI)),f=1/Math.sqrt(Math.PI);if(t<=0||u<1)return 1;if(i=.5*t,even=parseInt(u/2*2,2)==u,u>1&&(n=Math.exp(-i)),r=even?n:2*new jsstats.NormalDistribution(0,1).cumulativeProbability(-Math.sqrt(t)),u>2){if(t=.5*(u-1),s=even?1:.5,i>20){for(o=even?0:h,a=Math.log(i);s<=t;)e=a*s-i-(o=Math.log(s)+o),r+=Math.exp(e),s+=1;return r}for(o=even?1:f/Math.sqrt(i),a=0;s<=t;)a+=o*=i/s,s+=1;return a*n+r}return r},ChiSquareDistribution.prototype.cumulativeProbability=function(t){return 1-this.ChiSquaredProbability(t)},jss.ChiSquareDistribution=ChiSquareDistribution}(jsstats);

function linRegression(M,N,idx,depidx,ftest)
{
    if (depidx == undefined)
    {
       depidx = []
       for (var k = 0; k < M.length;k++)
         if (idx != k )
             depidx.push(k)
    }
    else
    {
       if (!Array.isArray(depidx))
           depidx = [0,depidx]
    }

	if (ftest != undefined)
	{
		ftest = ftest.map((x) => depidx.findIndex((y)=>x==y))
	}

	var A = []
	var b = [];
	var K = depidx.length;
	var maxi = 0;
	for (var s = 0; s < K;s++)	
	{
		var k = depidx[s];
		b.push(M[idx][k])
		var a = []
		for (var j = 0; j < K;j++)
		{
			var i = depidx[j]
			a.push(M[i][k])
			if (math.abs(M[i][k]) > maxi)
			    maxi = math.abs(M[i][k]);
		}
		A.push(a)
	}

//    var reg = math.multiply(0.1,math.eye(K))
    var reg = math.multiply(0.000001,math.eye(K))

    A = math.add(A,reg)._data;
	var Ainv = math.inv(A);
	var res = math.multiply(Ainv,b);
	var err2 = math.dots(res,math.multiply(A,res)) - 2*math.dots(res,b) + M[idx][idx];
	var stats = {m:res._data,p:[],t:[],r2:[],sdev_x:[],mean_x:[],idx:[]};

	stats.error = Math.sqrt( err2/N )
	stats.sdev_y = Math.sqrt((M[idx][idx]/N - M[0][idx]*M[0][idx]/(N*N) ) )
	stats.expvar = 1 - (stats.error/stats.sdev_y)*(stats.error/stats.sdev_y);
	stats.beta = [];

    var st = new jsstats.TDistribution(N-K)
	
	for (var s = 0; s < K;s++)	
	{
         var se = Math.sqrt(err2* Ainv._data[s][s]/(N-K))
         var t = res._data[s]/se;
  	   //  var p = 2*student_t(N-K,-Math.abs(t));
  	     var p = 2*st.cumulativeProbability(-Math.abs(t));
  	     stats.p.push(p)
  	     stats.t.push(t)

  	     var sdev_x = Math.sqrt(Math.abs(A[s][s]/N - A[s][0]*A[s][0]/(N*N)))
         stats.sdev_x.push(sdev_x)

  	     var mean_x = A[s][0]/N;
         stats.mean_x.push(mean_x)

  	     var cov = b[s]/N - A[s][0]*b[0]/(N*N)
  	     var r2 = cov / (sdev_x*stats.sdev_y)
  	     stats.r2.push(r2)

  	     stats.idx.push(depidx[s]-1)

		 stats.beta.push(stats.m[s]*sdev_x/stats.sdev_y)

	}

	if (ftest != undefined)
	{
		var fval = ftest.map((x) => stats.t[x]*stats.t[x]).reduce((x,y)=>x+y,0)/ftest.length
	    var sf = new jsstats.FDistribution(ftest.length,N-K)
		var pval = 1-sf.cumulativeProbability(fval)
	    stats.ftest = fval;
		stats.ftest_pval = pval;
	}


	return stats;
}



function regressout(data,stats)
{
    var residual = [];
	for (var k = 0;k < data[0].length;k++)
	{
 	   var p = data[0][k];
	   for (var j = 1; j < data.length;j++)
	       p -= data[j][k]*stats.m[j]
	   residual[k] = p;
	}
	return residual;

}

function pstats(stats,data,idx0,idx1)
{
    if (idx0 == undefined)
        idx0 = 0;
    if (idx1 == undefined)
        idx1 = 1;

	var err2 = 0;
	var cnt = 0;
	var m_0=0;
	var q_0=0;
	var m_1=0;
	var q_1=0;
	var c = 0;
	for (var k = 0;k < data[idx0].length;k++)
	{
		if (!isNaN(data[idx0][k]) && !isNaN(data[idx1][k]))
		{
		   //var d = data[idx0][k]*stats.m + stats.b - data[idx1][k];
		   var d = data[idx0][k]*stats.m[1] + stats.m[0] - data[idx1][k];
		   err2 += d*d
		   m_0 += data[idx0][k];
		   m_1 += data[idx1][k];
		   q_0 += data[idx0][k]*data[idx0][k];
		   q_1 += data[idx1][k]*data[idx1][k];
		   c += data[idx0][k]*data[idx1][k];
		   cnt++;
		}
	}
	m_0 /= cnt;
	m_1 /= cnt;
	var cop = 0
	for (var k = 0;k < data[idx0].length;k++)
	{
		if (!isNaN(data[idx0][k]) && !isNaN(data[idx1][k]))
		{
            cop += (data[idx0][k] -m_0)*(data[idx1][k] -m_1)
		}
	}	
	cop /= cnt;
	var s_0 = q_0/cnt - m_0*m_0;
	var s_1 = q_1/cnt - m_1*m_1;

    var s = (s_0+s_1)/2;


	var cm = (c/cnt - m_0*m_1)/math.sqrt(s_0*s_1);
	err2 = err2 / cnt;
    var expvar = 1-err2/s_1;
    var StErr = Math.sqrt(err2/ s_0 /(cnt-2))
    var t = stats.m/StErr
	var p = 2*student_t(cnt-2,-Math.abs(t));


    var stats = {m:stats.m,b:stats.b,icc:cop/s,r2:cm,sdev_x:math.sqrt(s_0),sdev_y:math.sqrt(s_1),error:math.sqrt(err2), expvar:expvar ,t:t ,p:p ,nans:data[0].length-cnt}
    return stats


}


function computeCorrelationMatrix(data,nointerscept)
{
		var xy = []
		var M = [];

		for (var k = 0; k < data.length+!nointerscept;k++)
		{
		    var m = [];
			for (var j = 0; j < data.length+!nointerscept;j++)
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

            if (nointerscept)
            {
				for (var j = 0; j < data.length;j++)
					for (var s = 0; s < data.length;s++)
						M[s][j] += data[s][k]*data[j][k]    				 

            }
            else
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


function rankTransform(arr,datatransform)
{
	if (datatransform == undefined | datatransform == 0)
	   return arr;
	var res = [];
	var N = arr.length;
	var r = arr.map((i,e) => { return {i:i,e:e} })
			   .sort( (x,y)=> x.i-y.i )


	var rank = 0;
	for (var k = 0;k < N;k++)  
	{
		res[r[k].e] = rank/N;
		if (k < N-1)
		{
			if (r[k+1].i != r[k].i)
				rank++;
		}

	}  	           


	return res;
}


function organizeData(sheet,sels,type,datatransform,combicols,keepstring)
{

	var data = sheet.data;
	var colnames = sheet.columns;
	var deselected_rows = sheet.deselected_rows

	var numerical_data = [];
	var combinatorial_dataset = [];
	var Temp = [];

	var namekeys = {}


	for (var j = 0 ; j < sels.length;j++)
	{
		if (type[sels[j]]<0)
			continue;
		

		var min = 100000000000;
		var max = -100000000000;
		var mapkey = x => { if (x == "") return "empty"; else return x; }
		if (colnames[sels[j]] != undefined && colnames[sels[j]].substring(0,11) == 'PatientsSex')
		{
			var tmp = mapkey;
			mapkey = x => tmp(x).replace("W","F")
		}

		var combinatorial = false
		if (combicols != undefined)
		{
            if (combicols[sels[j]])
                combinatorial = true;
		}
		var covariate = type[sels[j]]==0;

		var d = []
		var dn = []
		var l = [];
		var uniset = {}
		var colkeys = {}
		for (var k = 0; k < data.length;k++)
		{
			var ck = data[k][0]
			if (colkeys[ck] == undefined)
			{
				colkeys[ck] = 0;
			}
			else
			{
				colkeys[ck]++;
				ck = ck + " " + colkeys[ck];				
			}
			if (deselected_rows[k])
				continue;	

			l.push(ck)		                	


			var v = data[k][sels[j]];
			//if (combinatorial == true )
			{
				var vk = mapkey(v)
				if (uniset[vk] == undefined)
				{
					uniset[vk] = true;
					if (Object.keys(uniset).length> 30)
						combinatorial = false;
				}
				dn.push(vk);
			}
			var vstr = v;
			if (typeof v == 'string')
				v = parseFloat(v.replace(/,/,'.'))
			if (isNaN(v) && keepstring)
				v = vstr;
			d.push(v)
			if (!isNaN(v) & v != Infinity & v != -Infinity)
			{
				if (min > v) min = v;
				if (max < v) max = v;
			}
		}
		var n = colnames[sels[j]];
		var nk = n.split(/[\.\_\ ]/)
		for (var k = 0; k < nk.length;k++)
		   if (namekeys[nk[k]] == undefined)
			 namekeys[nk[k]] = 1;
		   else
			 namekeys[nk[k]]++;



		if (combinatorial)
		{
			combinatorial_dataset.push({data:dn,uniset:uniset,name:n,name_short:n,max:max,min:min,sel:sels[j],type:type[sels[j]]});
		//    Temp.push(combinatorial_dataset)
		}
		else
		{
			d = rankTransform(d,datatransform);
			max = -Infinity;
			min = Infinity;
			for (var k = 0 ;k < d.length;k++)
			{
				var v = d[k];
				if (!isNaN(v) & v != Infinity & v != -Infinity)
				{
					if (min > v) min = v;
					if (max < v) max = v;					
				}
			}



			var obj = {numerical_data:d,name:n,name_short:n,max:max,min:min,ids:l,sel:sels[j],covariate:covariate,uniset:uniset}
			numerical_data.push(obj);
			Temp.push(obj)			    
		}
	}

	for (var k in namekeys)
	{
		if (namekeys[k] == Temp.length)
		{
			for (var i = 0; i < Temp.length;i++)
			{
				Temp[i].name_short = Temp[i].name_short.replace(k,"").replace(/\_/,"").replace(/\./,"")
			}

		}
	}

	return {numerical_data:numerical_data,combinatorial_dataset:combinatorial_dataset  }
}



function ChartPanel(sheet,title,id)
{

	var theplot;

	var during_screenshot = false;
    if ( id == undefined)
        id = 'defaultchart'

    Chart.defaults.global.defaultFontColor = 'black';
    var panel = KPanel($(document.body), id, title);
	panel.$container.width(700)
    panel.$container.height(600)

    var $options = $("<div class='KchartOptions'>  </div>")

    var $downloadassvg = $("<div class='modernbutton small'> export as svg </div>")
    $options.append($downloadassvg)

    $downloadassvg.click(function(){

        var ctx_save = ctx;
		during_screenshot = true
		if (panel.currentChart != undefined)
            panel.currentChart.destroy();

		ctx = C2S(panel.$container.width(),panel.$container.height());


    	theplot.update()
        panel.currentChart;
        var svg = ctx.getSerializedSvg(true)
        console.log(svg);
		initiateDownload(svg, projectInfo.name + "_plot.svg");		
       

        during_screenshot = false;
        ctx = ctx_save;


		panel.currentChart = undefined;

    	theplot.update()


    });


    function setUnresponsive(charty)
    {
		if (during_screenshot)		    
		{
			charty.options.responsive = false
			charty.options.animation = false
		}
    }



    function attachPointClickHandler(canvas,panel,sheet,that)
    {
				canvas[0].onclick = function(evt){
				  var currentChart = panel.currentChart
				  var activePoints = currentChart.getElementAtEvent(evt);

				  // make sure click was on an actual point
				  if (activePoints.length > 0) {
					var clickedDatasetIndex = activePoints[0]._datasetIndex;
					var clickedElementindex = activePoints[0]._index;
					var value = currentChart.data.datasets[clickedDatasetIndex].data[clickedElementindex];     
					var cmenu = KContextMenu(
									function(e) {
										var $menu = $("<ul class='menu_context'>")

										.append($("<li onchoice='deactivate' > deactivate </li>"))                
										.append($("<li onchoice='select' > select in table </li>"))                
										.append($("<li onchoice='auto' > start autoloader </li>"))                
										.append($("<li onchoice='copy' > copy to clipboard </li>"))                								
										.append($("<hr width='100%'> "))
										.append($("<span>  &nbsp  "+value.label+"  </span>"))
										return $menu;
									},
									function(str, ev,eo)
									{
										if (str == "deactivate")
										{
											var s = value.label.split(" ")
											var idx
											idx = sheet.rowidx[value.label];
                                            sheet.deselected_rows[idx] = true;
                                            sheet.table.find("tr[row="+idx+"]").addClass("excluded");
                                            var $rows = sheet.table.find("tr")
                                            that.update();
										}
										if (str == "select")
										    $("input[name='PIZ']")[0].value = value.label
										if (str == "auto")
										{
											var id = value.label.split("#");
											if (id[1] != undefined)
											    id[1] = "#" + id[1];
											startAutoloader(ViewerSettings.autoloaders, {piz:id[0], sid:id[1]} );

										}
										if (str == "copy")
										{
											var $temp = $("<textarea style='position:absolute; display:block;z-index:99999;top:0px'>"+value.label+"</textarea>").appendTo($body).select();
											var successful = document.execCommand('Copy');
											$temp.remove();
										}

									}
									,true);

					cmenu(evt);				
				  }
				};
    }









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



    function addStatinfo(obj,settarget,txt)
    {
        var x = "<div class=tablestatinfo> <div> " +  obj.name ;
        for (var k = 0; k < obj.length;k++)
            x += " </div> <div> " + obj[k]
        x += "</div></div>";
        var y = $(x);
        if (settarget != undefined)
		{
	        y.append($("<div class='tablesettarget'> "+txt+" </div>").click(settarget));
		}
		if (txt == "set target")
			y.append($("<div class='tabledeactivate'> <i class='fa fa-close'> </i> </div>").click(function(e) { settarget(e,true) }));
        $statinfo.append(y)
    }



    function initPlot(x)
    {
    	theplot = x;
 	    $options.append(x.$options)
        $statinfo.children().remove();
    	
    }

    function addOption(which,visname,id,def,type,options)
    {
    	which[id] = def;
    	if (type == 'option')
    	{
			var $par = $(" <label for='"+id+"'> "+visname+"</label> <select name='"+visname+"' id='"+id+"'></select>")
	        for (var k = 0;k < options.length;k++)		
	            $("<option value='" + options[k].val + "'> " + options[k].name + "</option>").appendTo($($par[2]));

			$($par[2]).on("change",function(e)
			{
			    which[id] = e.target.value;
				which.update(e)
			})
    	}
    	else
    	{
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
    	}
		which.$options.append($par)

    }


    /**************************************************************
    * ScatterPlot
    **************************************************************/

    scatterPlot.$options = $("<div>")

    
	addOption(scatterPlot,"rank transform","datatransform",0,"checkbox")
	addOption(scatterPlot,"switch x/y","switchxy",0,"checkbox")
	addOption(scatterPlot,"prediction plot","predplot",0,"checkbox")

    function scatterPlot(type_,sels_,args,originalTarget)
    {
		
        var type = $.extend({},type_);
        initPlot(scatterPlot)

        if (args != undefined)
        {
			for (var k in args)
				scatterPlot[k] = args[k];
        }

        scatterPlot.update = function(e)
		{
		    scatterPlot(type_,sels_,undefined,originalTarget)
		}

        var target = 1;
        var other = -1;
        var sels = sels_;


    	if (sels == undefined)
    	   sels = Object.keys(type)

        var tidx = 2;
        var sidx = 1;
        if (scatterPlot.switchxy)
        {
        	tidx = 1;
        	sidx = 2;
        }

        var ftest = [];
        var {numerical_data,combinatorial_dataset} = organizeData(sheet,sels,type,scatterPlot.datatransform,sheet.combicols)
        for (var k in type)
        {
            if (type[k] == tidx)
            {
                target = numerical_data.map((x)=>x.sel).findIndex((x)=> x==k)
            }
            if (type[k] == sidx & type[k] != 0)
            {
				var ot_ = numerical_data.map((x)=>x.sel).findLastIndex((x)=> x==k)
				if (other == -1)
		            other = ot_
				ftest.push(ot_);
            }
            
        }
        if (other == -1)
            other = (target+1)%2;
        if (target == -1)
            target = (other+1)%2;
            
        
        var ndata = numerical_data.map((x) => x.numerical_data);
      //  var cdata = numerical_data.map((x) => x.numerical_data);

		if (originalTarget != undefined && numerical_data[target].sel != originalTarget)
		{
			other = numerical_data.findIndex((x)=> x.sel==originalTarget)
		}


        for (var k in combinatorial_dataset)
        {
        	var cd = combinatorial_dataset[k]
        	var ui = Object.keys(cd.uniset)
			for (var r =0; r < ui.length-1;r++)
			{
				var j = ui[r];
				ndata.push(cd.data.map((x)=> x==j))
				numerical_data.push({name:cd.name+"="+j,sel:cd.sel})
			}
        }

        var nointerscept = 0; //combinatorial_dataset.length>0
        var {M,nans} = computeCorrelationMatrix(ndata,nointerscept)
        var N = ndata[0].length-nans;
        var stat = linRegression(M,N,target+!nointerscept,undefined,ftest.map((x)=>x+!nointerscept))
        console.log(stat)
		var txt_target = ['sdev: ' + fixNumberStr(stat.sdev_y,-3),
				   'error: '+fixNumberStr(stat.error,-3),
				   'explained var. (r2): '+fixNumberStr(stat.expvar*100,-2)+"%",
				   '#samples: '+N+" (nans:" + nans + ")",
				   ]
		txt_target.name = 'TARGET '+ numerical_data[target].name

        if (scatterPlot.predplot)
        {
        	
        	var ndata_ = ndata.map((x)=>x);
        	var ntarget = ndata[target];
			var ntarget_scramble = []
			var n_expv = 0;
			var n_err = 0;

            txt_target.push("<p class=KTargetPredP> </p>")

			var T = 10000;
			var totX = 0;
			var dummyArr = new Array(T)
			dummyArr.chunk(function(){
				var idx = ntarget.map((x,i)=> ({i:i,r:Math.random()})).sort((x,y)=> x.r-y.r).map((x) => x.i);
            	for (var j = 0; j < ntarget.length;j++)
            	{
            		var ri = idx[j]; //Math.floor(Math.random()*ntarget.length)
            		ntarget_scramble[j] = ntarget[ri];
            	}
            	ndata_[target] = ntarget_scramble;


				var {M,nans} = computeCorrelationMatrix(ndata_,nointerscept)
				var stat_scramb = linRegression(M,ndata[0].length-nans,target+!nointerscept)
				totX++;
				if (stat_scramb.expvar > stat.expvar)
				    n_expv++;
                if (stat_scramb.error < stat.error)
				    n_err++;

                $statinfo.find(".KTargetPredP").html("p(exp.var>"+Math.floor(stat.expvar*100)+"%|0hyp): "+log10Str(n_expv/totX))
               // $statinfo.find(".KTargetPredP").html("p (error): "+log10Str(n_err/totX) + "<br>p (expv): "+log10Str(n_expv/totX))


			},5,1);

        }

		addStatinfo(txt_target,allvsall,"allvsall");

		function allvsall(params) {
		    var panel = KPanel($(document.body), "allvsall", "all vs all");
			panel.$container.width(700)
		    panel.$container.height(600)

		    panel.$container.addClass("Kchart")
			addCustomResizer(panel.$container, {});
			
            var $tablebox = $("<div class=KTableViewerBox_ava></div>")
			
            panel.$container.append($tablebox);
			var stats = [];
			var Q = ndata.length			
	        for (var k = 0; k < Q;k++)
				stats.push(linRegression(M,N,k+1))
			stats.push(linRegression(M,N,0))

			var vars = ["p","beta","t","r2"];
			for (var r = 0; r < vars.length;r++)
			{
	    		var $table = $("<table class='KTableCorrmat'>").appendTo($tablebox);
	
				var $thead = $("<thead>").appendTo($table);
				var $row = $("<tr>").appendTo($thead)
				$row.append($("<td> "+vars[r]+" </td>"))
	
				var $body = $("<tbody>").appendTo($table);
	
		        for (var k = 0; k < ndata.length;k++)
				{
					var $th = $("<td><span>" + numerical_data[k].name.replace(/\./g," ") + "</span></td>");
					$row.append($th)
				}
				var $th = $("<td><span> i.cept </span></td>");
				$row.append($th)
				
		        for (var k = 0; k < Q+1;k++)
				{
					var $row = $("<tr>").appendTo($body)
					var name;
					if (k==Q)
						name = "i.cept";
					else
						name = numerical_data[k].name.replace(/\./g," ")
					var stat = stats[k];
					var $td = $("<td><span>" + name + "</span></td>");
					$row.append($td)
			        for (var j = 0; j < Q+1;j++)
						{
							var v;
							if (k==Q)
							{
								if (j==Q)
									v = ""
								else
									v = stat[vars[r]][(j-1+1)%Q];
							}
						    else if (j>k)
								v = stat[vars[r]][(j-1+1)%Q];
							else if (j==k)
								v = "";
							else
								v = stat[vars[r]][(j+1)%Q]
							var $td = $("<td><span>"+fixNumberStr(v,-2)+ "</span></td>");
							$row.append($td)	
							
						}				
					
				}
	
			}			
			
		}


        for (var k = 0+!nointerscept; k < stat.p.length;k++)
        {
			var txt = ['beta: '+fixNumberStr(stat.m[k]*stat.sdev_x[k]/stat.sdev_y,-1) +' m: '+ fixNumberStr(stat.m[k],-3) + ', sdev: ' + fixNumberStr(stat.sdev_x[k],-3) ,
					   'p: <b>'+log10Str(stat.p[k]) + '</b>, t: '+fixNumberStr(stat.t[k],-1)]
			var n = numerical_data[stat.idx[k]+nointerscept]
			if (type_[n.sel] == 0)				
				txt.name = "<mark style='background:lightblue'>"+ n.name + "</mark>";
			else
				txt.name = "<mark style='background:green; color:white;'>"+ n.name + "</mark>";
			var settarget = function(n) {return function(e,deactivate){
				    if (deactivate)
					{
						for (var i in type_)
					    {
					    	if (i==n.sel)
								type_[i] = type_[i]-10;
						}					
					}
					else
					{
					    var otype = -1;
					    var rtype = -1;
						for (var i in type_)
					    {
					    	if (type_[i] == 2)
					    	    otype = i;
					    	else if (i==n.sel)
					    	    rtype = i;
					    }
					    var tmp = type_[otype];
					    type_[otype] = type_[rtype]
						type_[rtype] = tmp;
					}
					scatterPlot.update()
			}}(n)
			//if (n.numerical_data == undefined) // if this is combi data
			  //  settarget = undefined;
			addStatinfo(txt,settarget,"set target");
        }
		for (var k in type_)
			{
				if (type_[k] <0)
				{
					var txt = [];
					txt.name = sheet.columns[k]
					addStatinfo(txt,function(k){return function(){
						type_[k] = type_[k]+10;
						scatterPlot.update()
						
						}}(k),"activate");
				}
					
			}


		
        if (!nointerscept)
        {
			var txt = [ 'm: '+fixNumberStr(stat.m[0],-3),
						'p: <b>'+log10Str(stat.p[0]) + '</b>, t: '+fixNumberStr(stat.t[0],-1)]

			txt.name = "intercept"
			addStatinfo(txt);
        }

		if (ftest != undefined && ftest.length > 1)
		{
			var txt = []
			var name = 'Ftest: p: <b>'+log10Str(stat.ftest_pval) + '</b>';
			for (var k = 0; k < ftest.length;k++)
				txt.push(numerical_data[ftest[k]].name + ";")
			txt.name = name	
			addStatinfo(txt);
			
		}





        var xlabel,ylabel,min,max,modelfit,xy,modellabel
        if (stat.p.length == 2 && !nointerscept)
		{        
            if (target == 0 | scatterPlot.switchxy)
            {
               var idx0 = 1;
               var idx1 = 0;
            }
            else
            {
               var idx0 = 0;
               var idx1 = 1;
            }

			xlabel = numerical_data[idx0].name
			ylabel = numerical_data[idx1].name
			min = numerical_data[idx0].min;
			max = numerical_data[idx0].max;

			modelfit = [{x:min,y:stat.m[1]*min+stat.m[0]},{x:max,y:stat.m[1]*max+stat.m[0]}]
            modellabel = "fit: y = " + stat.m[1].toFixed(3) + "*x + " + stat.m[0].toFixed(3); 

			xy = ndata[idx0].map(function(e, i) {
			  return {x:e, y:ndata[idx1][i] , label: numerical_data[idx0].ids[i]};
			});
		}
		else
		{

            if (scatterPlot.predplot)
            {

				min = numerical_data[target].min;
				max = numerical_data[target].max;

				modelfit = [{y:min,x:(min)},{y:max,x:(max)}]
			
				modellabel = "prediction"
				ylabel = numerical_data[target].name
				xlabel = "prediction"


				xy = ndata[target].map(function(e, i) {
					var pred = stat.m[0]
					for (var k = 1; k < stat.p.length;k++)
						pred += stat.m[k]*ndata[stat.idx[k]][i]
					return {y:e, x:pred, label: numerical_data[target].ids[i]};
				});
            }
            else
            {
		
				modellabel = "model"
				ylabel = numerical_data[target].name
				xlabel = numerical_data[other].name + " (corrected)"

				var other_sidx = stat.idx.findIndex((x) => (x==other));
				xy = ndata[target].map(function(target_val, i) {
					var cov = 0; //stat.m[0]
					for (var k = 1; k < stat.p.length;k++)
					{
						if (k != other_sidx)
							cov += stat.m[k]*ndata[stat.idx[k]][i]
					}
					var other_val = ndata[other][i]+cov/stat.m[other_sidx];
					if (isNaN(other_val))
					    cov;
					var r = {y:target_val, x:other_val}
					if (numerical_data[target].ids != undefined)
					    r.label= numerical_data[target].ids[i]; 
					return r
				});

				var xvals = xy.map((x)=>x.x).filter((x) => !isNaN(x));
				var min = math.min(xvals);
				var max = math.max(xvals);
				var ymin = stat.m[0] + stat.m[other_sidx]*min
				var ymax = stat.m[0] + stat.m[other_sidx]*max

				modelfit = [{x:min,y:(ymin)},{x:max,y:(ymax)}]

            }

		}

		if (panel.currentChart != undefined)
            panel.currentChart.destroy();

		var charty = {
			data: {
				datasets: [{
					type:'scatter',
					label: "data",
					pointBackgroundColor: 'rgba(0,0,0,255)',					

					data: xy
				},{
					type:'line',
					label: modellabel,
					borderColor:"rgba(255,128,128,0.5)",
					pointColor: 'rgba(0,255,0,1)',					
					fill:false,
					data: modelfit
				}
				]
			},
			options: {
				tooltips: {
					
						 callbacks: {
							label: function(tooltipItem, data) {
								if (tooltipItem.datasetIndex == 0)
							       return "PSID: "+ numerical_data[0].ids[tooltipItem.index]
							    else
							       return modellabel;
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
		}

        $statinfo.addClass("visible")

		setUnresponsive(charty)
        panel.currentChart = new Chart(ctx,charty); 	
		attachPointClickHandler(canvas,panel,sheet,scatterPlot)
        	
    }
    panel.scatterPlot = scatterPlot


    /**************************************************************
    * Corr mat
    **************************************************************/


    corrMatrix.$options = $("<div>")
	addOption(corrMatrix,"rank transform","datatransform",0,"checkbox")
    function corrMatrix(type)
    {
    	type = $.extend({},type)
    	var sels = Object.keys(type)


        panel.$container.find(".KTableViewerBox").remove();
        panel.$container.find(".modernbuttongroup").remove();
        initPlot(corrMatrix)
       // $options.hide()
        $statinfo.hide()
        canvas.hide();
         
        corrMatrix.update = function(e)
		{
		    corrMatrix(type)
		}

		for (var k in type)
		    if (type[k] > 1)
		        type[k] = 3;
/*
        var present = {}
        for (var k in type)
            present[type[k]] = 1;
        if (!present[1])
        {
        	for (var k = 1; k < sheet.columns.length;k++)
        	{
        		if (type[k] == undefined)
        		    type[k] = 1;
        	}
        	sels = Object.keys(type)
        }
*/



        var {numerical_data,combinatorial_dataset} = organizeData(sheet,sels,type,corrMatrix.datatransform,sheet.combicols)

   

        var max_p = 0;
        var min_p = 10000;

        
        var ndata = numerical_data.map((x) => x.numerical_data);
        for (var k in combinatorial_dataset)
        {
        	var cd = combinatorial_dataset[k]
        	var ui = Object.keys(cd.uniset)
			for (var r =0; r < ui.length-1;r++)
			{
				var j = ui[r];
				ndata.push(cd.data.map((x)=> x==j))
				numerical_data.push({name:cd.name+"="+j,sel:cd.sel})
			}
        }
        var sels = numerical_data.map((x)=>x.sel);

        var atype = []; // indep. vars
        var btype = []; // targets
        var ctype = []; // covs
        for (var k = 0; k < sels.length;k++)
        {
        	if (type[sels[k]] == 1)
        	    atype.push(k)
        	else if (type[sels[k]] == 0)
        	    ctype.push(k)        	    
        	else 
        	    btype.push(k)
        }
        if (btype.length == 0)
            btype = atype;




        var {M,nans} = computeCorrelationMatrix(ndata)
        var N = ndata[0].length-nans;

        if (N == 0)
        {
            alertify.error("No valid data found");
            panel.close();
            return;
        }

        var pcoll = [];
        var pstat = []
        for (var j_ = 0; j_ < atype.length;j_++)        
        {
        	var j = atype[j_]
        	var prow = []
			for (var k_ = 0; k_ < btype.length;k_++)
            {
            	var k = btype[k_]
            	if (j!=k)
            	{
					var lm = linRegression(M,N,k+1,[0,j+1].concat(ctype.map((x)=>x+1)));
					var p = pstats(lm,ndata,j,k);
					if (!isNaN(lm.p[1]))
					    pcoll.push(lm.p[1])
					var logp = -Math.log(lm.p[1]+0.000001);
					if (logp > max_p)
					    max_p = logp;
					if (logp < min_p)
					    min_p = logp;
					lm.logp = logp;
					prow.push(lm)
            	}
            	else
            	    prow.push(undefined)

            }
            pstat.push(prow)
        }



       
	   var $tools = $("<div class='modernbuttongroup'></div>").appendTo(panel.$container);
	   $("<div class='modernbutton small green'>p-val</div>").appendTo($tools)
	       .click( function() { createTable("p")   } );
	   $("<div class='modernbutton small green'>t-val</div>").appendTo($tools)
	       .click( function() { createTable("t")   } );
	   $("<div class='modernbutton small green'>slope</div>").appendTo($tools)
	       .click( function() { createTable("m")   } );
	   $("<div class='modernbutton small green'>i.cept</div>").appendTo($tools)
	       .click( function() { createTable("b")   } );
	   $("<div class='modernbutton small green'>r2</div>").appendTo($tools)
	       .click( function() { createTable("r2")   } );
	   $("<div class='modernbutton small green'>expvar</div>").appendTo($tools)
	       .click( function() { createTable("expvar")   } );


	   function exportResults(csv) { 


			createTable("p",false,csv)
			createTable("t",true,csv)
			createTable("m",true,csv)
			createTable("b",true,csv)
			createTable("r2",true,csv)
			createTable("expvar",true,csv)

			$tablebox.find("table").css('font-size',7)

            if (csv)
    			initiateDownload(csv_export, projectInfo.name + "_statistics.csv");		
            else
            {
				var doc = new jsPDF({format:'a4',unit:'px','orientation':'portrait' });
				doc.fromHTML($tablebox[0], 10, 0, {	} );
				window.open(doc.output('bloburl'), '_blank');
            }
            
			createTable("p")


	        } 

 	    $("<div style='float:right' class='modernbutton small '>to PDF</div>").appendTo($tools).click( function() { exportResults(false )})
 	    $("<div style='float:right' class='modernbutton small '>to CSV</div>").appendTo($tools).click( function() { exportResults(true )})


        var current_sort_idx = undefined;
        var current_sort_col = undefined;
        var alpha = 0.05;
        pcoll = pcoll.sort((x,y) => x-y)
        var V = pcoll.length;
        var r0=-1; 
        var r1=-1; 
        var cVN = 0;
        for (var i = 0; i < V;i++)
            cVN += 1/(1+i);
        for (var i = 0; i < V;i++)
        {
            if (pcoll[i]<(i+1)/V*alpha)
               r0 = i;
            if (pcoll[i]<(i+1)/V*alpha/cVN)
               r1 = i;
        }
        var fdr0 = +pcoll[r0]
        var fdr1 = +pcoll[r1]
        var fdr2 = +0.05/V




        var $tablebox = $("<div class=KTableViewerBox></div>")
        panel.$container.append($tablebox);
  

        var covstr = ""
        for (var k = 0; k < ctype.length;k++)
       	  covstr += numerical_data[ctype[k]].name + ", ";

        var last = 'p'; 
		var csv_export;
        function createTable(which, append,csv)
        {
            last = which;
        	if (!append)
        	{
        	    $tablebox.children().remove();
        	    csv_export = "";
        	}

            if (which == 'p')
            {
				$("<span class='corrmatheading'> threshold at FDR 5% (Benjamini/Hochberg):"+fdr0.toFixed(5)+"* </span><br>").appendTo($tablebox);
				$("<span class='corrmatheading'> threshold at FDR 5% (Benjamini/Yekutieli):"+fdr1.toFixed(5)+"** </span><br>").appendTo($tablebox);
				$("<span class='corrmatheading'> threshold at 5% (Bonferoni):"+(fdr2).toFixed(5)+"*** </span><br>").appendTo($tablebox);
				$("<span class='corrmatheading'> #samples:"+N+"</span><br>").appendTo($tablebox);
				$("<span class='corrmatheading'> #tests:"+V+"</span><br>").appendTo($tablebox);
                if (covstr != "")
	                $("<span class='corrmatheading'> Covariates:"+covstr+" </span>").appendTo($tablebox);
            }
            else if (which == 't')
				$("<span class='corrmatheading'>t-value </span><br>").appendTo($tablebox);
            else if (which == 'b')
				$("<span class='corrmatheading'>intercept </span><br>").appendTo($tablebox);
            else if (which == 'm')
				$("<span class='corrmatheading'>slope </span><br>").appendTo($tablebox);
            else if (which == 'expvar')
				$("<span class='corrmatheading'>explained variance </span><br>").appendTo($tablebox);
            else if (which == 'r2')
				$("<span class='corrmatheading'>Pearsons r2 </span><br>").appendTo($tablebox);

    		var $table = $("<table class='KTableCorrmat'>").appendTo($tablebox);


			var $thead = $("<thead>").appendTo($table);
			var $row = $("<tr>").appendTo($thead)
			$row.append($("<td> "+which+" </td>"))
			if (csv & which == 'p')	
			{
				csv_export += "threshold at FDR 5% (Benjamini/Hochberg):"+fdr0.toFixed(5)+"*\n"
				csv_export += "threshold at FDR 5% (Benjamini/Yekutieli):"+fdr1.toFixed(5)+"**\n"
				csv_export += "threshold at 5% (Bonferoni):"+(fdr2).toFixed(5)+"***\n"
				csv_export += "#tests:"+V +"\n";
				csv_export += "#samples:"+N +"\n";
                if (covstr != "")
	               csv_export += "Covariates:"+covstr+"\n";

			}
			csv_export += "\n\n"+ which + ";"


			var $body = $("<tbody>").appendTo($table);

			for (var j_ = 0; j_ < btype.length;j_++)        
			{
				var j = btype[j_]
				var $th = $("<td><span>" + numerical_data[j].name.replace(/\./g," ") + "</span></td>");
 			    $row.append($th)

				$th.click(function(sc) { return function() {  
				    if (current_sort_idx != undefined && current_sort_idx['asc'] == 1)
				        current_sort_idx = undefined
				    else
				    {
				    	if (current_sort_col != sc && current_sort_idx != undefined)
				    	{
				    	
				    		delete current_sort_idx['desc']
				    		delete current_sort_idx['asc']
				    	}
						current_sort_col = sc;
				        current_sort_idx = sort($body,sc,current_sort_idx);
				    }
				    
				    createTable(which, append,csv)

				     }}(j_+1))
 			    if (csv)
 			    	csv_export += numerical_data[j].name + ";"
			}

			if (csv)
			    csv_export += "\n";


            for (var j__ = 0; j__ < atype.length;j__++)        
            {
            	var j_ = j__;
            	if (current_sort_idx != undefined) // sorting
            	    j_ = current_sort_idx[j__];
				    
				var j = atype[j_]
				var $row = $("<tr>").appendTo($body)
				$row.append($("<td><span>" + numerical_data[j].name.replace(/\./g," ") + "</span></td>"))
 			    if (csv)
 			    	csv_export += numerical_data[j].name + ";"

		   	    for (var k_ = 0; k_ < btype.length;k_++)
                {
            	   var k = btype[k_]
            	   var thestat = pstat[j_][k_]
				   var v = undefined;
                   var star = ""
				   if ( thestat != undefined)
				   {
					   if (which == 'm')
						 v =  thestat.m[1];
					   else if (which == 'b')
						 v =  thestat.m[0];
					   else if (which == 'p' | which == 't' | which == 'r2' )
						 v =  thestat[which][1];
					   else if (thestat[which] != undefined)
						 v =  thestat[which];				       
					   if (thestat.p[1] <= fdr0)
						   star = "*"
					   if (thestat.p[1] <= fdr1)
						   star = "**"
					   if (thestat.p[1] <= fdr2)
						   star = "***"
				   }
				   var span;
				   if (v != undefined)
				   {
					  if (csv)
					  {
					  	 if (which != "p" | v < 0.05)
						     csv_export += v.toFixed(5) + ";"
						 else
                             csv_export += ";"						 
					  }
				    
				      span = $("<span>" + v.toFixed(5) + star + "</span>")
				   }
				   else
				   {
					  if (csv)
						csv_export += ";"
				    
				      span =  $("<span> </span>")
				   }

				   var td = $("<td></td>").append(span)
				   if (v != undefined)
				   {
				   	   var f = thestat.logp/max_p
				   	   var colR,colG,colB;
				   	   if (thestat.m[1] < 0)
				   	   {
						   colR = (255-128*f).toFixed(0);
						   colB = 255
						   colG = (255-128*f).toFixed(0);
				   	   }
				   	   else
				   	   {
						   colR = (255-128*f).toFixed(0);
						   colG = 255
						   colB = (255-128*f).toFixed(0);
				   	   }
					   td.css('background',"rgb(" + colR + ","  + colG + ","  + colB + ")");
					   td.click(function(k,j) { return function(){

                            type;
							var ntype = {}
							var asel = numerical_data[k].sel;
							var bsel = numerical_data[j].sel;
							ntype[asel] = 2;
							ntype[bsel] = 1;
							var vars = [bsel,asel];
							for (var r = 0; r < ctype.length;r++)
							{
								var csel = numerical_data[ctype[r]].sel;
								if (ntype[csel] == undefined)
								{
									ntype[csel] = 0;
									vars.push(csel);
								}
							}
							
							if (Object.keys(numerical_data[k].uniset).length == 2)
							{
                                var n = "Model: " +numerical_data[k].name ;
    							var cpanel = ChartPanel(sheet , n , "chartlin_00");
							    cpanel.tstats(ntype);							    
							}
							else
							{
                                var n = "Linear Model: " +numerical_data[k].name + " vs. " + numerical_data[j].name							    
								var cpanel = ChartPanel(sheet , n , "chartlin_00");
    						    cpanel.scatterPlot(ntype,vars,{datatransform:corrMatrix.datatransform})
							}

					   }  }(k,j) )
					   td.addClass("button")
				   }
				   $row.append(td)

				}
				if (csv)
			      csv_export += "\n";
			}

        }

        function sort($table,col,idx)
        {

        	var sortcol = col;
			function table2data(tableBody){
			  var cnt = 0;
			  const tableData = []; // create the array that'll hold the data rows
			  tableBody.querySelectorAll('tr')
				.forEach(row=>{  // for each table row...
				  rowData = [];  // make an array for that row
				  row.querySelectorAll('td')[sortcol].innerText
				  var i = cnt++;
				  if (idx != undefined)
				      i = idx[i];				      
				  tableData.push({x:row.querySelectorAll('td')[sortcol].innerText,i:i});
				});
			  return tableData;
			}

			var dir = 1;
			if (idx != undefined && idx['desc'] == 1)
			    dir = -1;

			var data = table2data($table[0])
			 data.sort((a, b)=>{
				if(a.x > b.x){
				  return dir;
				}
				return -dir;
			  })

			var res = data.map((x) => x.i);

			if (dir == 1)
			    res['desc'] = 1;
			else 
			    res['asc'] = 1;

            return res;

  	    }


        createTable("p")


    }
    panel.corrMatrix = corrMatrix




    /**************************************************************
    * PRgraph
    **************************************************************/


    PRgraph.$options = $("<div>")
    addOption(PRgraph,"ROC ","ROC",0,"checkbox")
    addOption(PRgraph,"bootstrap:","bootstrap",-1,"number")

    function PRgraph(type)
    {
    	var sels = Object.keys(type)

        initPlot(PRgraph)
        PRgraph.update = function(e)
		{
		    PRgraph(type)
		}

        function ROCPR(ndata,cdata,bootstrap)
        {
            var tup = []
            var L = ndata.length;
            for (var j = 0;j < L;j++)  
            {   
                var k = j;
                if (bootstrap)
                	k = Math.floor(Math.random()*L);

				tup.push({n:ndata[k],c:parseInt(cdata[k])});
            }
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

            var flipped =false;
            if (AUC < 0.5)
            {
                AUC = 1-AUC;
                flipped = true;
    			if (PRgraph.ROC) 
    			{                          
					for (var ik = 0; ik < xy.length;ik++)
					{
						xy[ik].x = 1-xy[ik].x;
						xy[ik].y = 1-xy[ik].y;
					}
    			}
				else
				{
					for (var ik = 0; ik < xy.length;ik++)
					{
						xy[ik].x = 1-xy[ik].x;
					}
				}
            }
            return {xy:xy,AUC:AUC,acc_max:acc_max,acc_05:acc_05,max_th:max_th,toton:toton,N:N}

        }

        var combicol = {}
        for (var k in type)
         if (type[k] == 2)
             combicol[k] = 1;

        var {numerical_data,combinatorial_dataset,max,min} = organizeData(sheet,sels,type,undefined,combicol)

        var datasets = []
        for (var k = 0; k < numerical_data.length;k++)
        {
            var ndata = numerical_data[k].numerical_data;
            var cdata = combinatorial_dataset[0].data
				
            var conf = "";				
			if (PRgraph.bootstrap > -1)
			{
				var xy_ = [];
				var AUC_ = [];
				var Q = parseInt(PRgraph.bootstrap)+10;
				for (var t = 0; t< Q;t++)
				{
					var {xy,AUC} = ROCPR(ndata,cdata,true)
					xy_ = xy_.concat(xy)
					AUC_.push(AUC);
				}
                //xy_ = xy_.sort(function(x,y) { return y.y-x.y })
				//xy=xy_;
				AUC_ = AUC_.sort();
				conf = "  ("+ AUC_[math.floor(Q*0.05)].toFixed(2) + ", " + AUC_[math.floor(Q*0.95)].toFixed(2) + ")"
			}
			var {xy,AUC,acc_max,acc_05,max_th,toton,N} = ROCPR(ndata,cdata)


            var txt = ['accuracy@50%: ' + acc_05.toFixed(2),
                       'accuracy(max): ' + acc_max.toFixed(2) + "@" + Math.round(100*max_th)+"%" ,
                       'balance: ' + (100-100*toton/N).toFixed(2) + "%",
                       "AUC: " + AUC.toFixed(2) + conf
                       ]
            //if (flipped)
             //   txt.push("flipped");

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


		var charty = {
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
		}
        setUnresponsive(charty)
		panel.currentChart = new Chart(ctx, charty);

    }
    panel.PRgraph = PRgraph



    /**************************************************************
    * Tstats
    **************************************************************/


    tstats.$options = $("<div>")
    //addOption(tstats,"#bins:","numberofbins",20,"number")
	addOption(tstats,"scatters","scatters",1,"checkbox")
	addOption(tstats,"violin","violin",1,"checkbox")
	addOption(tstats,"errorbars ","error_bars",1,"checkbox")
	addOption(tstats,"sort alternative","sortalt",0,"checkbox")

    function tstats(type)
    {
    	var sels = Object.keys(type)
        initPlot(tstats)        
        tstats.update = function(e)
		{
		    tstats(type)
		}
        var that = tstats;


        var combicol = {}
        for (var k in type)
         if (type[k] == 2 | sheet.combicols[k])
             combicol[k] = 1;


        var {numerical_data,combinatorial_dataset} = organizeData(sheet,sels,type,undefined,combicol)

        var numerical_data_ = numerical_data;
        var covariate_data = [];
        numerical_data = [];
        for (var k = 0; k < numerical_data_.length;k++)
        {
            if (numerical_data_[k].covariate)
                covariate_data.push(numerical_data_[k]);
            else
                numerical_data.push(numerical_data_[k]);
        }

        if (covariate_data.length > 0)
        {
            var cdata =  covariate_data.map((x) => x.numerical_data);
            var didx = [0];
            for (var k = 0; k < covariate_data.length;k++)
                didx.push(k+2)
            for (var k = 0; k < numerical_data.length;k++)
            {
                var ndata = [numerical_data[k].numerical_data].concat(cdata);
				var {M,nans} = computeCorrelationMatrix(ndata)
				var N = ndata[0].length-nans;
				var lm = linRegression(M,N,1,didx)
				numerical_data[k].numerical_data = regressout(ndata,lm);
				numerical_data[k].name += " (corrected)";

            }

        }



        var max = math.max(numerical_data.map(x => x.max))
        var min = math.min(numerical_data.map(x => x.min))

        var del = max-min;
        min = min - 0.02 * del;
        max = max + 0.02 * del;
        var cols = []
        var cnt = 0;
        var wcnt = 0;
        var sets = []
        var means = []
        var sdevs = [];
        var quants = [];
        var gn = [];
        var labels = [];
        var scatter_datasets = [];
        var errbars = {};




		if (tstats.sortalt)
		{
			function reverseString(str) {
				var newString = "";
				for (var i = str.length - 1; i >= 0; i--) {
					newString += str[i];
				}
				return newString;
			}

			numerical_data = numerical_data.sort(function(x,y) {
						return reverseString(x.name) > reverseString(y.name)?1:-1

			})
		}

        var totnumpoints = 0;
        var numpoints = []
		for (var j = 0 ; j < numerical_data.length;j++)
		{
			var n = numerical_data[j].numerical_data.length
			numpoints.push(n)
			totnumpoints += n;
		}

        for (var j = 0 ; j < numerical_data.length;j++)
        {
           if (numerical_data[j].covariate)
               continue;

           function compstat(num_data,lab_data,name,min,max,width)
           {
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
               sdevs.push(sdev)
               gn.push(num_data.length-nancnt)

               var sorted_index = []
               for (var k = 0; k < num_data.length;k++)
                   if (!isNaN(num_data[k]))
                       sorted_index.push({val:num_data[k],psid:lab_data[k]})
               var sorted_index = sorted_index.sort((x,y) => { return x.val-y.val });

               var sorted = sorted_index.map((x) => { return x.val });



               var p50 = sorted[Math.floor((num_data.length-nancnt)/2)];
               var p95 = sorted[Math.floor((num_data.length-nancnt)*0.95)];
               var p05 = sorted[Math.floor((num_data.length-nancnt)*0.05)];
               var p25 = sorted[Math.floor((num_data.length-nancnt)*0.25)];
               var p75 = sorted[Math.floor((num_data.length-nancnt)*0.75)];
               var order = Math.floor(Math.log10(sdev*2));
			   if (sdev==0) 
				   order = 0;
               quants.push([p25,p75])
               var nanstr="</div> <div> #samples: " + num_data.length;
               if (nancnt >0)
                nanstr = nanstr + " nans/inf:"+nancnt;
    
               means.push(mean);
           //    errbars[name] = {plus:mean+sdev,minus:mean-sdev};
           //    errbars[name] = {plus:sorted[num_data.length-1-nancnt],minus:sorted[0]};
               errbars[name] = {plus:p95,minus:p05};


               labels.push(name);


				var str = "<div> <div> " +  name 
				+" </div> <div> mean: "+fixNumberStr(mean,order)
				+" </div> <div> sdev: "+fixNumberStr(sdev,order) 
				+" </div> <div> p%(5,50,95): "+fixNumberStr(p05,order)+", "+fixNumberStr(p50,order)+", "+fixNumberStr(p95,order)
				+nanstr+"</div></div>"

               $statinfo.append($(str))

               var nbins = 20; //Math.min(100,num_data.length/10);
			   var histo = comphisto(p05,p95, nbins, num_data, num_data.length, num_data.length,0, false);
			   var maxi = histo.accus.maxfreq

				function shuffle(array) {
				  array.sort(() => Math.random() - 0.5);
				}

               var nbins = 20;
               var hist = []
               var cell = [];
               var lookup = {}
               var last_b = undefined
               var numv = 0;
               var meanv = [];
			   min = sorted[0];
			   max = sorted[sorted.length-1];
               for (var k = 0; k < sorted.length;k++)
               {
               	   if (!isNaN(sorted[k]))
               	   {
               	   	   numv++;
					   var b = Math.round(nbins*(sorted[k]-min)/(max-min))
					   if (b != last_b)
					   {			  
					      if (cell.length>0) 	   
					      {
							  shuffle(cell);	
							  hist.push(cell)
							  var m = cell.map((x)=>x.val).reduce((x,y) =>x+y,0)/cell.length
							  if (isNaN(m))
								  m = 0;
							  meanv.push(m);
					      }
						  cell = []			   	   	  
					   }
					   last_b = b;
					   cell.push(sorted_index[k])
               	   }
               }
			   meanv.push(sorted[sorted.length-1])
 			   shuffle(cell);	
			   hist.push(cell)
               
               var maxcnt = math.max(hist.map((x)=>x.length))

       		   if (tstats.scatters==1)
               {
				   var xy = [];
				   var mylabels = [];
				   for (var k = 0;k < hist.length;k++)
				   {
					  var w= hist[k].length
					  for (var s=0;s < w;s++)
					  { 
						  var fac = w/maxcnt*0.5;
						  var d = (Math.random()*fac)*((Math.random()>0.5)?1:-1);
							 xy.push({y:hist[k][s].val,x:cnt+d ,label:hist[k][s].psid})
							 mylabels.push(hist[k][s].psid)
					  }
				   }



				   scatter_datasets.push({
									mylabels:mylabels,
									legend:{display:false},
									type:'scatter',
									pointBackgroundColor: new KColor(KColor.list[cnt%KColor.list.length]).getCSS(),
									data: xy,
									name:name
								})
               }

	       	   if (tstats.violin == 1)
	       	   {
				   for (var i = -1; i<2;i+=2)
				   {
					   var xy = [{y:min,x:cnt}  ];
					   for (var k = 0;k < meanv.length;k++)
					   {
						  var w= hist[k].length
						  var d = w/maxcnt*0.5;
						  xy.push({y:meanv[k],x:cnt+i*d })

					   }
					   xy.push({y:max,x:cnt});

                       var backgroundColor = undefined;
                       if (tstats.scatters == 0)
                           backgroundColor = new KColor(KColor.list[cnt%KColor.list.length]).getCSS();
					   scatter_datasets.push({
										legend:{display:false},
										type:'line',								
										data: xy,
										pointRadius:0,
										backgroundColor: backgroundColor,
										name:name
									})
				   }
	       	   }

			   wcnt+=width;
			   cnt++
    

           }


           if (combinatorial_dataset != undefined && combinatorial_dataset.length > 0)
           {
			   var num_data = numerical_data[j].numerical_data;  
			   var lab_data = numerical_data[j].ids;

			   rec(0,[])
			   
			   function rec(k,cond)
			   {
				   if (k == combinatorial_dataset.length)
				   {
					  show(cond)
					  return;
				   }
				   var combi = combinatorial_dataset[k]
				   for (var j in combi.uniset)
					   rec(k+1,cond.concat([j]))
					
 		       }
			   function show(conds)
			   {
					var ndata = []
					var ldata = [];

				    OUTERLOOP:
					for (var s = 0; s < num_data.length;s++)
					{
						for (var t = 0; t < conds.length;t++)
						{
							if (combinatorial_dataset[t].data[s] != conds[t])
								continue OUTERLOOP;
						}
						ndata.push(num_data[s])
						ldata.push(lab_data[s])
						
					}
				   var str = numerical_data[j].name_short + " "
				   for (var t = 0; t < combinatorial_dataset.length;t++)
					   str += combinatorial_dataset[t].name +"="+conds[t]+",";
				   compstat(ndata,ldata,str,numerical_data[j].min,numerical_data[j].max)
			   }
					   
            
           }
           else
           {
			   var num_data = numerical_data[j].numerical_data;
			   compstat(num_data, numerical_data[j].ids,numerical_data[j].name_short,numerical_data[j].min,
			               numerical_data[j].max,numpoints[j]/totnumpoints)
           }


        }


	   for (var k = 0; k < means.length;k++)
	   {
		   for (var i = k+1; i < means.length;i++)
		   {
			   var s2 = Math.sqrt((sdevs[k]*sdevs[k]*(gn[k]-1) + sdevs[i]*sdevs[i]*(gn[i]-1))/(gn[i]+gn[k]-2))
			   var t = (means[k] - means[i]) / s2
			   t *= Math.sqrt(gn[i]*gn[k]/ (gn[i]+gn[k]));
			   var p = 2*student_t(gn[i]+gn[k]-2,-Math.abs(t));
			   var res = ", p=" + p.toFixed(3);
			   $statinfo.append($("<div> <div>" +labels[k] +" vs "+labels[i]
			   +" </div> <div> t: "+t.toFixed(3)+res
			   +"</div></div>"))
		   }

	   }

        if (panel.currentChart != undefined)
            panel.currentChart.destroy();





		if (tstats.scatters==0 & tstats.violin == 0)
		{    	

				var datasets = []
				var dset_tpm =  {
					fill:false,
					borderWidth:1,
				}

				datasets.push($.extend({
						 label:name,
						 data:quants,
						 errorBars:(tstats.error_bars?errbars:undefined),
						 backgroundColor:(new KColor(KColor.list[cnt%KColor.list.length])).getCSS()
					   },dset_tpm) ) 	   



				var charty = 
				  {"type":"bar",
				   "data":{
							 "labels":labels,
							 "datasets":datasets },
					"options":{

							plugins: {
								chartJsPluginErrorBars: {
									color: 'black',
									lineWidth: 3,														
									absoluteValues: true

								} },
							maintainAspectRatio:false,

							"scales":{"yAxes":[{
									ticks:{"beginAtZero":true},
									scaleLabel: {
									   display: true,
									   labelString: "some units"
									 }

									}
									]

								}}}
            setUnresponsive(charty)
            panel.currentChart = new Chart(ctx,	charty);
			




		}
		else
		{
			var datasets = scatter_datasets

				var charty = 
				  {
					legend:{display:false},
				   "data":{
							 "datasets":datasets },
					"options":{
							legend:{display:false},

							tooltips: {
									 callbacks: {
										label: function(tooltipItem, data) {
											console.log(tooltipItem);
										   var d = datasets[tooltipItem.datasetIndex] 
										   if (d.mylabels != undefined)
											   return d.name + 
											   ": " + d.data[tooltipItem.index].y + " \n" +
													  "PSID: " + d.mylabels[tooltipItem.index];
										    else
										        return "";
										}
									 }
								  },				

							plugins: {
								chartJsPluginErrorBars: {
									color: 'black',
									lineWidth: 3,														
									absoluteValues: true

								} },
							maintainAspectRatio:false,

							"scales":{
								"yAxes":[{
									ticks:{"beginAtZero":true,
										  min:min,max:max},
									scaleLabel: {
									   display: true,
									   labelString: "value"
									 }

									}
									],
								"xAxes":[{
									type:"linear",
									ticks: {
										min: -1,
										max: cnt,
										stepSize: 0.5,
										callback: function(value, index, values) {
											if (labels[value] != undefined)
											{
												return labels[value]
											}
											
										}
									  }


									}
									]

								}}}
                setUnresponsive(charty)								
                panel.currentChart = new Chart(ctx,charty);
                attachPointClickHandler(canvas,panel,sheet,tstats)

		}




    }
    panel.tstats = tstats




    /**************************************************************
    * Histogram
    **************************************************************/


    histogram.$options = $("<div>")
    addOption(histogram,"#bins:","numberofbins",20,"number")
    addOption(histogram,"normalized:","normalized",1,"checkbox")

    function histogram(type)
    {
    	var sels = Object.keys(type)

        initPlot(histogram)
        histogram.update = function(e)
		{
		    histogram(type)
		}


        var {numerical_data,combinatorial_dataset} = organizeData(sheet,sels,type,undefined,sheet.combicols)

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
			   var histo = comphisto(min,max, n, num_data, num_data.length, num_data.length,histogram.normalized!="1",false)
			   datasets.push($.extend({
					 label:name,
					 data:histo.accus,
					 backgroundColor:(new KColor(KColor.list[cnt])).getCSS()
				   },dset_tpm) ) 	   
			   cnt++;


               var {str,obj} = compSimpleStats(num_data,name)

			   $statinfo.append(str)
			   sets.push(obj);

           }


            


           if (combinatorial_dataset != undefined && combinatorial_dataset.length > 0)
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
               var p = 2*student_t(a.n+b.n-2,-Math.abs(t));
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
           yd.push(fixNumberStr(v,order))
        }

        if (panel.currentChart != undefined)
            panel.currentChart.destroy();

         var charty ={"type":"bar",
           "data":{
   	                 "labels":yd,
   	                 "datasets":datasets },
   	        "options":{
					maintainAspectRatio:false,
   	               	"scales":{"yAxes":[{
   	               		    ticks:{"beginAtZero":true},
						    scaleLabel: {
							   display: true,
						       labelString: histogram.normalized=="1"?("percent (%)"):"counts"
						     }

   	               		    }
   	               		    ]

   	               		}}}
        setUnresponsive(charty)				
		panel.currentChart = new Chart(ctx,charty)
				   	               		
    }
    panel.histogram = histogram

    seriesPlot.$options = $("<div>")
    
    function seriesPlot(type)
    {
    	var sels = Object.keys(type)

        initPlot(seriesPlot)
        seriesPlot.update = function(e)
		{
		    seriesPlot(type)
		}
        var datasets = []
        
        var color_col = -1;
        for (var k in type)    
            if (type[k]==2)
            {
            	color_col = k;
            	break;
            }

        var sortcrit = [];

		var myformat = new Intl.NumberFormat('en-US', { 
			minimumIntegerDigits: 3, 
			minimumFractionDigits: 2 
		});
		function doformat(x)
		{
			var n = parseFloat(x)
			if (!isNaN(n))
				return myformat.format(n);
			else
				return x;
		}		
        for (var j = 0;j < sels.length;j++)
        {
            var x = sheet.columns[sels[j]];
            var s = x.split(".");
			var v = s.map(doformat).join(".");
            sortcrit.push({j:sels[j],v:v});
        }
        sortcrit.sort((x,y) => (x.v > y.v)?1:-1)

        var deselected_rows = sheet.deselected_rows;
		for (var j = 0; j < sheet.data.length;j++)
		{
			if (deselected_rows[j])
			    continue;
			var sdata = [];
			for (var k = 0; k < sels.length;k++)
			{				
				if (sels[k] != color_col)
				{
                    var s = sortcrit[k]
					if (sheet.data[j][s.j] != '')
					    sdata.push({x:k,y:sheet.data[j][s.j]});
				}
			}
		
            var colidx = j%KColor.list.length;
		    if (color_col != -1)
            {
                colidx = parseInt(sheet.data[j][color_col])
                colidx = colidx%KColor.list.length;
            }

            datasets.push(        
                {
					type:'line',
					label: sheet.data[j][0],
					borderColor: new KColor(KColor.list[colidx]).getCSS(),
					pointColor: 'rgba(0,0,0,0)',					
					fill:false,
					data: sdata
				})

		}
		if (panel.currentChart != undefined)
            panel.currentChart.destroy();

		var charty = {
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
							labelString: "x-axis"
						  }
					}],
					yAxes: [{
						type: 'linear',
						position: 'left',
						  scaleLabel: {
							display: true,
							labelString: "y-axis"
						  }
					}]
				}
			}
		};
		panel.currentChart = new Chart(ctx, charty);		
        setUnresponsive(charty)				




    }
    panel.seriesPlot = seriesPlot

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
  var $head
  var $body
  var $colg

  var lines;
  var data;
  var colnames;
  var rowidx;
  var selections = {}
  var combicols = {}
  var sheet;
  var fobj;
  var deselected_rows;
  var tobj,original_content
  var derived_cols = [];

  var default_deselect_expression = "";

  that.getTobj = function() 
  {
  	return tobj;
  }

  that.extendDragObj = function (obj)
  {
  	if (obj.intent == undefined)
  	    obj.intent = {};
  	obj.intent.tobj = tobj;
  }


  that.setContent = setContent;
  function setContent(ev,intent)
  {

    fobj = ev

    if (fobj.currentFileID == undefined)
    {
    	if (intent && intent.intent && intent.intent.tobj)
    	{
			fobj.fileID = intent.intent.tobj.fileID
			fobj.filename =intent.intent.tobj.fileselector
		    signalhandler.detach("close",that.viewport.sigid);
		    signalhandler.detach("close",that.sigid_close);
			
    	}
    }

	if ($div != undefined)
		$div.remove();


  

	if (intent && intent.intent && intent.intent.tobj)
    {
      tobj=intent.intent.tobj;
     // toolbar.$metaimport.hide();

    }
    else
    {
     // toolbar.$save.hide();
      tobj = undefined;
    }


    data = []
    colnames = [];
    rowidx = [];
    var rowcnt = {};
    selections = {}
	deselected_rows = {}

    sheet = { data : data, columns : colnames, deselected_rows:deselected_rows , rowidx:rowidx, combicols:combicols}




	$div = $("<div class='KViewPort_tableViewer_outerDiv'>").appendTo(that.$container);

	$table =  $("<table class='KViewPort_tableViewer' ></table>").appendTo($div);
    sheet.table = $table;

    var aborter = function()
		{
			aborter.aborted = true
		}
  	that.viewport.progressSpinner("rendering table",aborter);
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


    original_content = ev.content;

	var delimiter = ";"
    if (intent && intent.intent && intent.intent.delimiter)
    {
		delimiter = intent.intent.delimiter
	}
	else
	{
		var fl = str.search("\n");
		var firstline = str.substring(0,fl);
		var numcomma = firstline.split(/,/).length-1;
		var numsemicol = firstline.split(/;/).length-1;
		var numtab = firstline.split(/\t/).length-1;
		if (numsemicol == 0)
		{
			if (numcomma > numtab)
				delimiter = ",";
			else
				delimiter = "\t";
		}
		
	}
	
	  
    str = str.replace(new RegExp(delimiter+ "\n","g"),"\n");
	lines = str.split("\n");
	lines = lines.filter((x) => x != "")
	$head = $("<thead>")
	$body = $("<tbody>")
	$colg = $("<colgroup>");



	var header = true;

	var nate = [];
	var header_lines=0

	var chunk_size = Math.min(80,Math.floor(1000/colnames.length))
	var chunk_pos = 0;

	$div.on("scroll",function(e)
	{	
		if ($div.scrollTop() >  $div[0].scrollHeight-$div.height()-5)
			renderTableChunk()
	})


    function renderTableChunk()
    {
        if (chunk_pos == undefined)
            return;
    	var start = chunk_pos*chunk_size
    	var end = (chunk_pos+1)*chunk_size
    	if (data.length<end)
    	{
    	    end = data.length
    	    chunk_pos = undefined
    	}
		for (var k = start; k < end;k++)
		{			
			var $row = $("<tr></tr>");

			for (var i = 0; i < data[k].length;i++)
			{
				var cell = $("<td>"+data[k][i]+"</td>")
				if (colnames[i] == 'PSID')
				{
                    if (sheet.deselected_rows[k])
					    $row.addClass("excluded");        	 						
                    cell.on("dblclick",function(e)
                    {
                        $("input[name='PIZ']")[0].value = (e.target.textContent)
                    }); 
				}
			    $row.append(cell)
			}
			$row.attr("row",k)
			$row.on('contextmenu',KContextMenu(function(e) {
							
						var $menu = $("<ul class='menu_context'>")
						.append($("<li onchoice='copy' > copy deselected rows to clipboard</li>"))
						.append($("<li onchoice='copynon' > copy non deselected rows to clipboard</li>"))
                
						return $menu;

					},
					function(str, ev,eo)
					{
                        if (str == "copy")
                        {
                            var str = "";
                            for (var k in sheet.deselected_rows)
                            {
								if (sheet.deselected_rows[k])
	                            	str +=  sheet.data[k][0] + " "
                            }

							var $temp = $("<textarea style='position:absolute; display:block;z-index:99999;top:0px'>"+str+"</textarea>").appendTo($body).select();
							var successful = document.execCommand('Copy');
							$.notify(" Copied to clipboard","success");
							$temp.remove();


                        }
                        if (str == "copynon")
                        {
                            var str = "";

							for (var k = 0; k < sheet.data.length;k++)
								{
									if (!sheet.deselected_rows[k])
		                            	str +=  sheet.data[k][0] + " "
								}
        
							var $temp = $("<textarea style='position:absolute; display:block;z-index:99999;top:0px'>"+str+"</textarea>").appendTo($body).select();
							var successful = document.execCommand('Copy');
							$.notify(" Copied to clipboard","success");
							$temp.remove();


                        }

					},true
			))

			$row.on('click',function(e)
			{
				if (e.ctrlKey)
				{
					e.preventDefault();
					e.stopPropagation();
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
				}
			});

			$row.appendTo($body);

		}
		chunk_pos++;
    }



	lines.chunk( function(line,k)
		{
			if (line == "")
				return;
		    if (aborter.aborted)
			   return false;
			

			var entries = line.split(new RegExp(delimiter + '(?=(?:(?:[^"]*"){2})*[^"]*$)'))

			var $row = $("<tr></tr>");


			if (k>0 & entries[0] != "")
			   header=false;
			if (header)
			{
				header_lines++;
				$row.appendTo($head);
				$row.on('contextmenu',KContextMenu(
					function(e) {

	                    var i = $(e.target).parent().children().index($(e.target));		                    

						var $menu = $("<ul class='menu_context'>")
						.append($("<li onchoice='selectall' > select all columns</li>"))
						.append($("<li onchoice='selectallvalid' > select columns (with valid data)</li>"))

						if (window.getSelection().toString() != "")
							$menu.append($("<li onchoice='selectmarked' > select marked columns</li>"))
	
						$menu.append($("<li onchoice='deselectall' > deselect all columns</li>"))

						$menu.append($("<li onchoice='copy' > copy column(s)</li>"))
						$menu.append($("<hr>"))						
						$menu.append($("<li onchoice='add' > add column</li>"))
						$menu.append($("<li onchoice='rename' > rename column</li>"))
					    $menu.append($("<li onchoice='del' > delete column</li>"))
						$menu.append($("<hr>"))					    
						$menu.append($("<li onchoice='deselectrows' > deselect row by column value</li>"))
						$menu.append($("<li onchoice='undeselectrows' > remove all deselections</li>"))
						$menu.append($("<hr>"))					    
						$menu.append($("<li onchoice='combi' > toggle combinatorial</li>"))

                
						return $menu;

					},
					function(str, ev,eo)
					{
						var cs = $colg.find("col[colhead=1]")

						var i = $(eo.target).parent().children().index($(eo.target));		                    

                        function getCols()
                        {
							var cols = Object.keys(selections)
                            if (cols.length == 0 || selections[i] == undefined)
                            {
                            	cols = [i]
                            }
                            else if (cols.length > 10)
                            {
                            	cols = [i].concat(cols.slice(0,10).filter((x) => x != i));
                            }
                        	return cols;
                        }
                        if (str == "combi")
                        {
    						var cf = $table.find(".combiflag")
                        	if (combicols[i] == 1)
                        	{
							    $(cf[i]).removeClass("combicol")
							    combicols[i] = 0;
                        	}
                        	else
                        	{
							    $(cf[i]).addClass("combicol")
							    combicols[i] = 1;
                        	}

                        }
                        if (str == "undeselectrows")
                        {
                        	deselected_rows = {}
                        	sheet.deselected_rows =deselected_rows;
                        	sheet.table.find("tr").removeClass("excluded");     
                        }

                        if (str == "deselectrows")
                        {


							var cols = getCols()
							var str = "<table class='Ktablecolsel'> <head> <tr> <td> idx </td> <td> name </td> </tr> </head>";
							str += "<body>";
							for (var k = 0; k < cols.length;k++)					
							{
								str += "<tr>"
							    str += "<td>"+k+"</td>"
							    str += "<td>"+colnames[cols[k]]+"</td>"
								str += "</tr>"
					    	}
							str += "</body>";
                            str += "</table>";
							alertify.prompt("Columns selected:<br>"+str+"<br>"+
							"<b> Enter an expression. Refer to the value by n(idx). For example, write 'n(0)>0 & n(1)>0' to select all rows that are larger than zero in column 0 and 1. Leave empty to select all valid numbers.</b> " ,function(e,str)
							{
								if (e)
								{
									default_deselect_expression = str;
									if (str == "")
									    str = "!isNaN(n(0))";
									var type = {}
									for (var k in cols)
									    type[cols[k]] = 1;

									deselected_rows = {}
									sheet.deselected_rows =deselected_rows;

                                    
									var {numerical_data,combinatorial_dataset,max,min} = organizeData(sheet,cols,type,undefined,undefined,true)
									var data = numerical_data[0].numerical_data;
									
									for (var k = 0; k < data.length;k++)
									{
 									
 										 function n(x)
										 {
                                            return numerical_data[x].numerical_data[k]
 										 }
                                         var v = eval(str)
										 if (!v)
										 {
											sheet.deselected_rows[k] = true;
											sheet.table.find("tr[row="+k+"]").addClass("excluded");        	 	
										 }
										 else
										 {
											sheet.deselected_rows[k] = false;
											sheet.table.find("tr[row="+k+"]").removeClass("excluded");     
										 }
									}
								}
							}, default_deselect_expression);

                        }
                        if (str == "del")
                        {
                        	var colg = $(cs[i])
                        	var id = colg.attr("colid");
                        	var $tr = $table.find("tr")
                        	for (var k = 0;k < $tr.length;k++)
                        		$($($tr[k]).children()[i]).remove();   
                        	colg.remove();
							for (var k=0;k < data.length;k++)
								data[k].splice(i,1)
							
                        	for (var j = 0;j < derived_cols.length;j++)                     		
                        	{
                        		if (derived_cols[j].id == id)
                        		{
                        		    derived_cols.splice(j,1)
                        		    break;
                        		}
                        	}
                        	console.log(derived_cols)
                        }
                        if (str == "rename")
                        {
                        	var cname = colnames[i];
						    var p_old = cname.split(".");
                        	
							alertify.prompt("Rename", function(e,str)
							{
								if (e)
								{
                                   colnames[i] = str;
                                   var p = str.split(".");
                                   var hs = $head.find("tr");
                                   for (var k = 0;k<hs.length;k++)
                                   {
                                   	  var cell = $(hs[k]).find("td")[i];
                                   	  if (cell != undefined && p[k] != p_old[k])
                                   	      cell.textContent = p[k]
                                   }


                                }    
							},cname);
						}

						if (str == "copy")
						{
							var outstr = "";
							var cols = getCols()
                               
						    for (var k = 0 ; k < lines.length;k++)
 	  					    {
                                var r = lines[k].split(";");
                                var cl = cols.length
								for (var s = 0; s < cl;s++)							    	
									outstr += r[cols[s]] + ((s==cl-1)?"":";")
								outstr += "\n";
						    }

							var $temp = $("<textarea style='position:absolute; display:block;z-index:99999;top:0px'>"+outstr+"</textarea>").appendTo($body).select();
							var successful = document.execCommand('Copy');
							$.notify(" Copied to clipboard","success");
							$temp.remove();
						    

						}
						if (str == "selectmarked")
						{					
							var range = window.getSelection().getRangeAt(0)
							var td = range.startContainer.parentNode.parentNode;
							var tdend = range.endContainer.parentNode.parentNode;
							
							for (var k = 0;k < 10000;k++)
								{
									var index = td.cellIndex;
									$(cs[index]).removeClass("tabcolselected tabcolselectedALT")
									
									if (ev.ctrlKey)
									{
									    selections[index] = 2
									    $(cs[index]).addClass("tabcolselected")
									}
									else
									{
									    selections[index] = 1
									    $(cs[index]).addClass("tabcolselectedALT")
									}
									if (td == tdend)
										break;
									td = td.nextSibling;
									if (td == undefined)
										break;
								}
						}
						if (str == "selectall")
						{
							for (var k = 1; k < cs.length;k++)
							{
								if (selections[k] == undefined)
								{
								    selections[k] = 1
								    $(cs[k]).addClass("tabcolselectedALT")
								}
							}
                			updatetoolbar();

						}
						if (str == "selectallvalid")
						{


							alertify.prompt("Percentage of valid rows", function(e,str)
							{
								if (e)
								{
									var cols;
									if (selections[i] == undefined | Object.keys(selections).map((x) => selections[x] != undefined).filter((x)=>x).length == 0)
										cols =Array.from({length: cs.length-1}, (_, i) => i + 1)
									else
										cols = getCols()

									var type = {}
									for (var k in cols)
										type[cols[k]] = 1;

									var rthres = parseFloat(str)/100;
									var idx = {};
									var {numerical_data,combinatorial_dataset,max,min} = organizeData(sheet,cols,type)							
									for (var k = 0; k < numerical_data.length;k++)
									{
										var d = numerical_data[k].numerical_data;
										var valid = 0;
										var dlen = d.length
										for (var j = 0;j<dlen;j++)
										{
											if (!isNaN(d[j]))
												valid++;
										}
										var ratio = valid/dlen;
										if (ratio > rthres | (rthres==1 & dlen==valid))
											idx[k] = 1;
									}

									for (var j = 0; j < cols.length;j++)
									{								
										var k = cols[j];
										if (idx[j] == 1)
										{
											if (selections[k] == undefined)
											{
												selections[k] = 1
												$(cs[k]).addClass("tabcolselectedALT")
											}
										}
										else
										{
											delete selections[k];
											$(cs[k]).removeClass("tabcolselected")
											$(cs[k]).removeClass("tabcolselectedALT")
											$(cs[k]).removeClass("tabcolselectedALT2")

										}
									}
									updatetoolbar();
								}

							},"95")

						}
						if (str == "deselectall")
						{
							for (var k = 1; k < cs.length;k++)
							{
								if (selections[k] != undefined)
								{
								    delete selections[k];
								    $(cs[k]).removeClass("tabcolselected")
								    $(cs[k]).removeClass("tabcolselectedALT")
								    $(cs[k]).removeClass("tabcolselectedALT2")
								}
							}
							updatetoolbar();
                		}
						if (str == "add")
						{
							var cols = getCols()
							var str = "<table class='Ktablecolsel'> <head> <tr> <td> idx </td> <td> name </td> </tr> </head>";
							str += "<body>";
							for (var k = 0; k < cols.length;k++)					
							{
								str += "<tr>"
							    str += "<td>"+k+"</td>"
							    str += "<td>"+colnames[cols[k]]+"</td>"
								str += "</tr>"
					    	}
							str += "</body>";
                            str += "</table>";
							alertify.prompt("Columns selected:<br>"+str+"<br>"+
							"<b> Enter an expression.</b> <br> Refer to strings by s(idx), where idx is the column index. Refer to numeric values by n(idx). "+
							"For example, for adding first and second column write n(0)+n(1) as an expression. If you want to add a binary"+
							"column from string equality write s(0)=='male'. For a custom name use // after the expression. Use Delta(idx,'str1','str2',..) for creating binary columns." ,function(e,str)
							{
								if (e)
								{
                                    that.addColumn(cols,str);
									chunk_pos=0;
									renderTableChunk();
									default_add_col = str;
								}
							},default_add_col
							);

						}


					},true))
			    var default_add_col = "";
				$row.on('click',function(e)
				{
					var col = $(e.target).parent().children().index($(e.target));
					var c = $($colg.find("col[colhead=1]")[col])
					//if (col == 0)
					//    return;
					if (e.shiftKey)					
					{
						document.getSelection().removeAllRanges();
						c.removeClass("tabcolselected")
						c.removeClass("tabcolselectedALT")						    
						c.addClass("tabcolselectedALT2")						    
					    selections[col] = 0;
					}
					else if (e.ctrlKey)
					{
				    	c.removeClass("tabcolselectedALT2")						    
						if (c.hasClass("tabcolselected"))
						{
						    c.removeClass("tabcolselected")
						    c.removeClass("tabcolselectedALT")		
						    				    
						    delete selections[col] 
						}
						else if (c.hasClass("tabcolselectedALT"))
						{
						    c.removeClass("tabcolselectedALT")
						    c.addClass("tabcolselected")						    
						    selections[col] = 2;
						}
						else
						{
						    c.addClass("tabcolselected")
						    selections[col] = 2;
						}
					}
					else if (!e.shiftKey)
					{
						if (window.getSelection().toString() != "")
							return;
					
					    c.removeClass("tabcolselectedALT2")
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



                    updatetoolbar();







				});
			}
			else
			{

			}

            var r = [];
            var last = "";
			for (var j = 0; j < entries.length;j++)
			{
				if (k==0)
				{
					$colg.append($("<col colhead=1>"));
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
			//		$colg.append($("<col>"));
					
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
                else
                {
					var entry = entries[j].replace(/\./g," ")
					if (entry == "")
						entry = "&nbsp";
					entry = "<span>" + entry + "</span>"
                	if (k==0)
                	    $row.append($("<td> "+entry+" <b class='combiflag'> combi. </b></td>"));		    
                	else
				        $row.append($("<td> "+entry+"</td>"));		    
                }
			}
			if (r.length > 0)
			{
			    data.push(r);
			    if (rowcnt[r[0]] == undefined)
			    {
			    	rowcnt[r[0]] = 1;
			        rowidx[r[0]] = data.length-1;
			    }
			    else
			    {
			        rowidx[r[0]+" "+rowcnt[r[0]]] = data.length-1;
			    	rowcnt[r[0]]++;
			    }
			}


		},5,1,function(i) {
		that.viewport.progressSpinner("rendering table " + Math.round(100*i/lines.length) + "%",aborter);} ,
		function() {
			if (data[0] == undefined)
			{
				that.viewport.progressSpinner("table empty");
				return;
				
			}

				

            var idlen = data[0].length;
            for (var k = 0; k < data.length;k++)
            {
            	while (data[k].length < idlen)
            	{
            		data[k].push("");
            	}
            }

            var hds = $head.find("tr")
            for (var k = 0; k < hds.length;k++)
            {
            	var l = $(hds[k]).children().length;
            	if (l<idlen)
            	{

            		for (var j = 0; j < idlen-l;j++)
            		{
            			if (k==0)
    					    $colg.append($("<col colhead=1>"));

            		    $(hds[k]).append($("<td></td>"))
            		}
            	}
            }


			$table.append($colg);
			$table.append($head);
			$table.append($body);
		//	attachTableOperator($div,undefined,true);	
			$table.show();
			that.setInnerLayout();
			that.viewport.progressSpinner(undefined)

 		    if (intent.intent && intent.intent.tablestate)		   
			   that.setState(intent.intent.tablestate)
			else if (tobj && tobj.state)
			   that.setState(tobj.state)
			
            renderTableChunk()
			   
		  
			updatetoolbar();

			} );
	
  }

  that.addColumn = function(cols,str)
  {    

    	    var id = math.round(Math.random()*100000000);


			derived_cols.push({expression:str,selections:cols,id:id})

			var k;
			function n(idx)
			{
				if (k == undefined)
					return colnames[cols[idx]];
				var x = parseFloat(data[k][cols[idx]].replace(",","."));
				return x;
			}

			function s(idx)
			{
				if (k == undefined)
					return colnames[cols[idx]];										
				return data[k][cols[idx]];
			}

            function delta(idx, ...args)
            {
            	return delta_(true,idx,...args);
            }

            function Delta(idx, ...args)
            {
            	return delta_(false,idx,...args);
            }

            function stair(idx, ...args)
            {
            	return stair_(true,idx,...args);
            }

            function Stair(idx, ...args)
            {
            	return stair_(false,idx,...args);
            }

			function delta_(ignore, idx, ...args)
			{
                var r = [];
				var val;
				var x = s(idx);
                for (var j = 0;j < args.length;j++)
                {
                    if (x == args[j])
                    {
                        val = j;
                        break;
                    }
                }
                if (val != undefined || ignore)
                {
                	var res = [];
                    for (var j = 0;j < args.length;j++)
                        res.push(0)
                    if (val != undefined)
                        res[val] = 1;
                }
                else 
                {
                	var res = [];
                    for (var j = 0;j < args.length;j++)
                        res.push(NaN)
                }
                return res;

			}

			function stair_(ignore, idx, ...args)
			{
				var val;
				var x = s(idx);
                for (var j = 0;j < args.length;j++)
                {
                	if (Array.isArray(args[j]))
                	{
                		for (var i = 0; i < args.length;i++)
                		{
                			if (x == args[j][i])
                			{
                				val = j;
                				break;
                			}
                		}
                	}
                    else if (x == args[j])
                    {
                        val = j;
                        break;
                    }
                }
                if (val != undefined || ignore)
                {
                	return val;
                }
                else 
                {
                	return NaN
                }
                return res;

			}


			var val
			var expression = "val="+str;
			for (k = 0; k < data.length;k++)
			{
			   eval(expression);
			   if (!Array.isArray(val))
			       val = [val];
               for (var j = 0;j < val.length;j++)
               {
				   if (val[j] === true)
					   val[j] = 1;
				   if (val[j] === false)
					   val[j] = 0;
				   if (isNaN(val[j]))
					  ;// val[j] = "";
				   data[k].push(val[j])
               }
			}

			k = undefined;
			var headname;
			var sstr = str.split("//");
			if (sstr.length == 1)
			{
				//eval("headname=" + str);
				headname = str;									    
			}
			else 
				headname = sstr[1].trim();

			$body.children().remove();

			for (var k = 0; k < val.length;k++)
			{
				var headnameN
				if (val.length > 1)
				    headnameN = headname + " (" + k + ")"
				else
				    headnameN = headname;
				var h = $head.children()
				for (var j = 0; j<h.length-1;j++ )
					$(h[j]).append($("<td> </td>"))
				$(h[h.length-1]).append($("<td> "+headnameN+" </td>"))
				$colg.append($("<col colhead=1 colid='"+id+"'>"));
				colnames.push(headnameN)
			}

  }


  that.getState = function() {
  	 var desel = []
  	 for (var k in deselected_rows)
  	    if (deselected_rows[k])
  	         desel.push(k)
     return { selections:selections, derived_cols:derived_cols, deselected_rows:desel ,combicols:sheet.combicols } 
  }

  that.setState = function(state) {
        
       if (state.deselected_rows)
       {
       	  for (var k in state.deselected_rows)
       	  {
       	  	  var idx = state.deselected_rows[k];
       	      deselected_rows[idx] = true
			  sheet.table.find("tr[row="+idx+"]").addClass("excluded");
       	  }
       }

       if (state.derived_cols)
       {
       	 for (var k = 0; k < state.derived_cols.length;k++)
       	 {
       	 	 var s = state.derived_cols[k];
       	     that.addColumn(s.selections,s.expression);
       	 }
       }


       var $colg = $table.find("colgroup")
	   var cs = $colg.find("col[colhead=1]")
	   var cf = $table.find(".combiflag")

       if (state.combicols)
       {
       	    for (var k in state.combicols)
       	    {
           	  var c = $(cf[k]);     
           	  if (c.length > 0) 	    	
			      c.addClass("combicol");
			  sheet.combicols[k] = 1;			  
       	    }       	    	

       	
       }



       for (var k in state.selections)
       {
       	 var c = $(cs[k]);
       	 if (c.length > 0)
       	 {
			  selections[k] = state.selections[k]
			  if (selections[k] == 0)
				  c.addClass("tabcolselectedALT2")						          	  	
			  if (selections[k] == 2)
				  c.addClass("tabcolselected")						          	  	
			  if (selections[k] == 1)
				  c.addClass("tabcolselectedALT")						          	  	
       	 }

       }



  }

  that.getDataContent = function()
  {
  	return {data:data,colnames:colnames,selections:selections};
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
  	that.toolbar.$screenshot.hide()
	$div.scrollTop(scrollTop);
	$div.scrollLeft(scrollLeft);
  }
  that.setInnerLayout = setInnerLayout;

  function updatetoolbar()
  {
     var index = false;
     var sel = false;
	 var num2 = 0;
	 var num1 = 0;
  	 for (var k in selections)
	 {
  	    if (selections[k] == 2)
		{
  	       index=true
		   num2++;
		}
  	    else if (selections[k] == 1)
		{
  	       sel=true
		   num1++;
		}
	 }
  	 var x = array_to_setObject(Object.keys(selections));
  	 toolbar.$histo.addClass("inactive")
  	 toolbar.$scatter.addClass("inactive")
  	 toolbar.$matrix.addClass("inactive")
  	 toolbar.$pr.addClass("inactive")
  	 toolbar.$tstat.addClass("inactive")
  	 //toolbar.$metaimport.addClass("inactive")
  	 toolbar.$seriesplot.addClass("inactive")

     if (num1==3 & num2==1)
	  	 toolbar.$createano.removeClass("inactive")
	 else
	  	 toolbar.$createano.addClass("inactive")
	  
     if (index && sel)
     {
      	// toolbar.$metaimport.removeClass("inactive")
      	 toolbar.$pr.removeClass("inactive")
     }
     if (sel | index)
     {
		 toolbar.$histo.removeClass("inactive")
		 toolbar.$scatter.removeClass("inactive")
		 toolbar.$matrix.removeClass("inactive")
		 toolbar.$tstat.removeClass("inactive")     
  	     toolbar.$seriesplot.removeClass("inactive")
		 	
     }
     updatetoolbar.sel = sel;
     updatetoolbar.index = index;
    
  }


  toolbar.$seriesplot = $("<div class='KViewPort_tool'><i class='fa fa-line-chart fa-1x'></i></div>")
        .click(function() { 
            var cpanel = ChartPanel(sheet ,"Series: " + fobj.filename)
			cpanel.seriesPlot(selections);

         }).appendTooltip("time series plot (time along col axis)")
  toolbar.$histo = $("<div class='KViewPort_tool'><i class='fa fa-bar-chart fa-1x'></i></div>")
        .click(function() { 
            var cpanel = ChartPanel(sheet ,"Histograms: " + fobj.filename)
			cpanel.histogram(selections);

         }).appendTooltip("histograms of selected columns");

  toolbar.$scatter = $("<div class='KViewPort_tool'><i class='fa fa-area-chart fa-1x'></i></div>")
        .click(function() { 
            var cpanel = ChartPanel(sheet ,"Linear model: " + fobj.filename)
			var origTarg = undefined;
			for (var k in selections)
				if (selections[k] == 2)
					origTarg = k;
			cpanel.scatterPlot($.extend({},selections),undefined,undefined,origTarg);

         }).appendTooltip("scatter plot and linear regression");
  toolbar.$matrix = $("<div class='KViewPort_tool'><i class='fa fa-th fa-1x'></i></div>")
        .click(function() { 
            var cpanel = ChartPanel(sheet ,"Correlations: " + fobj.filename)
			cpanel.corrMatrix(selections);

         }).appendTooltip("Correlations matrix");
  toolbar.$pr = $("<div class='KViewPort_tool'><i class='fa fa-1x'>PR</i></div>")
        .click(function() { 
            var cpanel = ChartPanel(sheet ,"PR/ROC graph: " + fobj.filename)
			cpanel.PRgraph(selections);

         }).appendTooltip("Precision/Recall and ROC curves");

  toolbar.$tstat = $("<div class='KViewPort_tool'><i class='fa fa-1x'>T</i></div>")
        .click(function() { 
            var cpanel = ChartPanel(sheet ,"T statistics: " + fobj.filename)
			cpanel.tstats(selections);

         }).appendTooltip("Bar plots");

  toolbar.$createano = $("<div class='KViewPort_tool'><i class='fa fa-1x fa-adn'></i></div>")
        .click(function() { 

			createPointset(selections);
		
         }).appendTooltip("Create Annotation");




  var contextmenu  = KContextMenu(
    function() {
    	var metaimportinactive = ""
    	if (!(updatetoolbar.index && updatetoolbar.sel))
            metaimportinactive = "inactive"

        var saveinactive = ""
        if (tobj == undefined)
            saveinactive = "inactive"
        var $submenu
        var $menu = $("<ul class='menu_context'>")
        .append($("<li onchoice='download' > download table </li>"))
        .append($("<li onchoice='metaimport' class='"+metaimportinactive+"' > import table as subject specific jsons</li>"))
        .append($("<li onchoice='save' class='"+saveinactive+"'> save criterias to analysis folder </li>"))
        .append($("<li onchoice='refetch' class='"+saveinactive+"'> refetch table </li>"))
        .append($("<li onchoice='fetchdlg' class='"+saveinactive+"'> refetch table (with dialog)</li>"))

        if (metaimportinactive == "")
        {
			var files = KViewer.dataManager.getFileList();
			for ( var f in files)
			{
				var fi = KViewer.dataManager.getFile(files[f]);
				if (fi.fileID != that.currentFileID)
				  if (fi.contentType == "tab")
					$menu.append($("<li onchoice='join_"+fi.fileID+"'> join table with "+fi.filename+"</li> </ul>" ))

			}
        }        


        return $menu;

    },
    function(str, ev)
    {
    	if (str != undefined)
    	{

    		if (str == 'save')
                save()
            else if (str == 'metaimport')
                metaimport()
            else if (str == 'refetch')
                refetch_table()
			else if (str == "fetchdlg")			
				fetch_table_dialog(tobj,state)
			else if (str == "download")
			    initiateDownload(that.content.content, projectInfo.name + "_meta.csv");		
			else if (str.substring(0,4) == "join")
			{
                var fid = str.substring(5);
                var tv = KViewPort.getViewerByFileID(fid)

                var res = KTableViewer.joinCSVs(that,tv[0])
                if (res.err)
                {
                    alertify.error(res.err)
                    return;
                }
                if (res.csv)
                {
                	var name = "JOIN_"+(that.currentFilename + "_" + tv[0].currentFilename).replace(/\.csv/g,"") + ".csv"
                    KTableViewer.addTableFileObject(res.csv,{name:name});
            		popupView({content:res.csv,contentType:"tab",filename:name},{intent:{singleview:true}})

                }


			}
    	}

    });

  toolbar.$cog = $("<div class='KViewPort_tool'><i class='fa fa-cog fa-1x'></i></div>").click(contextmenu);


 // toolbar.$download = $("<div class='KViewPort_tool'><i class='fa fa-download fa-1x'></i></div>")
 //       .click(function() { 
 //			initiateDownload(that.content.content, projectInfo.name + "_meta.csv");		
 //        }).appendTooltip("download table");

    function refetch_table()
    {
    	 var state = that.getState();
		 xhr = ajaxRequest('command=exportmeta&json=' + JSON.stringify(tobj) , function(e)
			{
                setContent({content:e.content,contentType:"tab"},{intent:{singleview:true,tobj:tobj,tablestate:state}})
			});
    }



    function fetch_table_dialog(tobj,state)
		{
		   var handle=getjsonascsv(tobj,function(e,tobj) {
					setContent({content:e.content,contentType:"tab"},{intent:{singleview:true,tobj:tobj,tablestate:state}})
				});
		   
		   var ps = tobj.template_json.map(function(x){ return {URLType:'serverfile', fileID:x.fileID, callback: handle.updateKeySearch,intent:{asjson:true}} });
		   for (var k = 0; k < ps.length;k++)
			   KViewer.dataManager.loadData(ps[k])
		   
		   return;
		}

    function metaimport() { 

            if (metaimport.defaultjsonname == undefined)
                metaimport.defaultjsonname = 'misc.json'
			alertify.prompt("Selected columns will be imported as json. Column names will be used as keys in json format. Please enter a name for the resulting json file.", function(e,name)
			{
				if (e)
				{
					var outstr = ""
					var cols = Object.keys(selections)
					if (cols.length == 0)
					{
						alertify.error("No columns are selected for import.");
						return;
					}
                    var psidcolname = 'PSID';
                    var psidcolfound = false;
					for (var k = 0 ; k < data.length;k++)
					{
						var r = data[k]; //lines[k].split(";");
						var cl = cols.length
						for (var s = 0; s < cl;s++)	
						{					
						    var d = r[cols[s]]	    	
							outstr += d + ((s==cl-1)?"":";")
						}
						outstr += "\n";
					}
					if (!selections[cols[k]] == undefined)
					{
						alertify.error("No PSID column is selected for import (hold CTRL while selecting)");
						return
					}

                    var header = ""
                    for (var k = 0; k < cols.length;k++)
                    {
						if (selections[cols[k]] == "2")
						   header += psidcolname +";";
						else
						   header += colnames[cols[k]] + ";";
                    }
                    outstr = header + "\n" + outstr;

					
                    var obj = {csv:outstr,jsonname:name}
				    var pbar = KProgressBar("importing","fa-submit",undefined,true,function()
				    {
				    	xhr.abortPHPprocess();
				    });
					var xhr = ajaxRequest('command=importcsv&json=' + encodeURIComponent(JSON.stringify(obj)) , function(e) {
                         alertify.alert("Result of import of meta data into " + name + " of " + cols.length + " column(s) \n\n" + "<textarea style='width:400px;height:500px'>"+e.content +"</textarea>");
 					     pbar.done();
					});
					metaimport.defaultjsonname = name;

				}
			},metaimport.defaultjsonname);


         }

 // toolbar.$metaimport = $("<div class='KViewPort_tool'><i class='fa fa-upload fa-1x'></i></div>")
   //     .click(metaimport).appendTooltip("upload table as meta information");
    function save() { 

          var analysis_folders = getCurrentAnalysisFolders() 
          var defaultfname = "untitled_table";


          if (tobj.fileinfo != undefined)
             defaultfname = [tobj.fileinfo.SubFolder, tobj.fileinfo.studies_id]
          


		  alertify.prompt({msg:'Name of table:',opt:analysis_folders, optMsg:"Analysis folder to save"},				  
			  function(e,val)
					{ 
					   if (e) { 
						if (val.option != undefined)
						{
							var finfo = { 
		                                   patients_id:"ANALYSIS", studies_id:val.option,
							  		       SubFolder:val.str,tag:'TABCREATOR'
							  		    }
					        
					        tobj.state = that.getState()

							uploadJSON.quiet = false;							  		    
		                    uploadJSON("table.json",tobj,finfo,
		                    function(e) {
								uploadBinary({content:original_content,filename:"content.csv",fileID:""},
							 			  finfo, function() {}, that.viewport.progressSpinner, false, "usenativePID")
								//uploadBinary({content:original_content,filename:"subjects.txt",fileID:""},
							 	//		  finfo, function() {}, that.viewport.progressSpinner, false, "usenativePID")
		                             });  	 



						}
					  }

					},defaultfname);  





        }



	function createPointset(type)
	{
		var sels = Object.keys(type)
				
		var combicol = {}
		for (var k in type)
		 if (type[k] == 2 | sheet.combicols[k])
			 combicol[k] = 1;
	
		var {numerical_data,combinatorial_dataset} = organizeData(sheet,sels,type,undefined,undefined,true)
	
		function fminindex(x)
		{
			var mini = 10000;
			var i=-1;
			for (var k = 0; k < x.length;k++)	
				{
					if (x[k]!=-1 & x[k] < mini & type[sels[k]] == 1)
					{
						mini = x[k];
						i = k;
					}
				}
			return i;
		}
			
		var xindex = fminindex(numerical_data.map( (x) => x.name.split("").reverse().join("").search("x")))
		var yindex = fminindex(numerical_data.map( (x) => x.name.split("").reverse().join("").search("y")))
		var zindex = fminindex(numerical_data.map( (x) => x.name.split("").reverse().join("").search("z")))
	
		var str = "<table class='Ktablecolsel'> <head> <tr> <td> name </td> <td> name </td> </tr> </head>";
		str += "<body>";
		var fis = [];
		var coordexpression = [];
		var others = [];
		for (var k = 0; k < numerical_data.length;k++)					
		{
			str += "<tr>"
			str += "<td> col"+(k+1)+"</td>";
			fis[k] = numerical_data[k].name
			str += "<td>"+fis[k]+"</td>"
			str += "</tr>"
			if (xindex == k) coordexpression[0] = "col"+(k+1);
			else if (yindex == k) coordexpression[1] = "col"+(k+1);
			else if (zindex == k) coordexpression[2] = "col"+(k+1);
			else others.push("col"+(k+1))
		}
		str += "</body>";
		str += "</table>";


		var defaults = [];
		if (ViewerSettings.createPointset_defaults != undefined)
			defaults = ViewerSettings.createPointset_defaults
		else
			defaults = [coordexpression.join(","),"1",				   
		   "if ("+others[0]+"==1) return cmap[2]; else return cmap[1]","ID",that.currentFilename.split(" ")[0].replace(".ano","").replace(".json","") ]
		
		alertify.prompt(
		
			 [{msg:"<b>Create Pointset Annotation</b> "+
				 "<br> define how to map columns to point properties<br>"+str+"<br>"+
				 " Put here your coordinate expression:"},
			  {msg:"Put here the expression for the size (in mm):"},
			  {msg:"Put here the expression for the color:"},
			  {msg:"Put here the expression for point name:"},
			  {msg:"Name of set:"}
			 ]
							
		,function(e,ret)
		{
			if (e)
			{
	
				if (!KViewer.markerTool.enabled)
					KViewer.markerTool.toggle()
	
				var set = KViewer.markerTool.createMarkerSet()					
	
				var cexp = ret[0];
				var cmap = KColor.list;

				const sdbm = str => {
				  var hashcode = 28372873;
				  let arr = str.split('');
				  return arr.reduce(
				    (hashCode, currentVal) =>
				      (hashCode = currentVal.charCodeAt(0) + (hashCode << 6) + (hashCode << 16) - hashCode),
				    0
				  );
				};				
				var n2c = (x) => Math.abs(sdbm(x))%KColor.list.length
				
				for (var k = 0; k < numerical_data[0].numerical_data.length;k++)
					{
						for (var j = 0; j < numerical_data.length;j++)	
							eval("var col" + (j+1) + " = numerical_data[j].numerical_data[k];");
	
						eval("var c = [" + ret[0] + "]");
						var p = set.addpoint([c[0],c[1],c[2],1]);
						var ID = numerical_data[0].ids[k];
						p.p.name  = eval(ret[3]);
						p.setsize(eval(ret[1]))
						p.setcolor(eval("cmap[(()=>{"+ret[2]+"})()]"))
					}
				set.name = ret[4];
	
				markerProxy.setCurrentSet( set);
				KViewer.markerTool.update();
				ViewerSettings.createPointset_defaults = ret;
				
			}
		},defaults);
	
	}

	
//  toolbar.$save = $("<div class='KViewPort_tool'><i class='fa fa-save fa-1x'></i></div>")
  //        .click(save).appendTooltip("save table and selection cirteria to analysis folders");


  //toolbar.attach(toolbar.$save);
  //toolbar.attach(toolbar.$download);
  //toolbar.attach(toolbar.$metaimport);
  toolbar.attach(toolbar.$createano);
  toolbar.attach(toolbar.$seriesplot);
  toolbar.attach(toolbar.$tstat);
  toolbar.attach(toolbar.$matrix);
  toolbar.attach(toolbar.$histo);
  toolbar.attach(toolbar.$scatter);
  toolbar.attach(toolbar.$pr);
  toolbar.attach(toolbar.$cog);


  updatetoolbar()


  return that;

}

chartjs_errorbars();

function chartjs_errorbars()
{

const defaultOptions = {
  /**
   * stroke color
   * @default: derived from borderColor
   */
  color: undefined,

  /**
   * width as number, or as string with pixel (px) ending, or as string with percentage (%) ending
   */
  width: 10,

  /**
   * lineWidth as number, or as string with pixel (px) ending, or array of such definition
   */
  lineWidth: 2,

  /**
   * whether the error values are given in absolute values or relative (default)
   */
  absoluteValues: false
};

const ErrorBarsPlugin = {
  id: 'chartJsPluginErrorBars',

  /**
   * get original barchart base bar coords
   * @param chart chartjs instance
   * @returns {Array} containing label, x, y and color
   * @private
   */
  _getBarchartBaseCoords(chart) {
    const coords = [];
    chart.data.datasets.forEach((d, i) => {
      const bars = chart.getDatasetMeta(i).data;
      const values = d.data;
      coords.push(bars.map((b, j) => {

        // line charts do not have labels in their meta data, access global label array instead
        let barLabel = '';
        if (!b._model.label) {
          barLabel = chart.data.labels[j];
        } else {
          barLabel = b._model.label; // required for hierarchical
        }
        return {
          label: barLabel,
          value: values[j],
          x: b._model.x,
          y: b._model.y,
          color: b._model.borderColor
        };
      }));
    });
    return coords;
  },

  /**
   * check whether the chart orientation is horizontal
   * @param chart chartjs instance
   * @returns {boolean}
   * @private
   */
  _isHorizontal(chart) {
    return chart.config.type === 'horizontalBar';
  },

  /**
   * compute error bars width in pixel or percent
   * @param chart chartjs instance
   * @param horizontal orientation
   * @param width plugin option width
   * @returns {*} width in pixel as number
   * @private
   */
  _computeWidth(chart, horizontal, width) {
    let widthInPx = width;

    try {

      if (typeof width === 'string') {
        if (width.match(/px/)) {
          widthInPx = parseInt(width.replace(/px/, ''), 10);
        } else {

          // handle percentage values: convert to positive number between 0 and 100
          const widthInPercent = Math.min(100, Math.abs(Number(width.replace(/%/, ''))));
          const model = chart.getDatasetMeta(0).data[0]._model;

          if (chart.config.type === 'line') {
            widthInPx = parseInt(model.controlPointPreviousX + model.controlPointNextX, 10);
          } else if (horizontal) {
            widthInPx = parseInt(model.height, 10);
          } else if (!horizontal) {
            widthInPx = parseInt(model.width, 10);
          }

          widthInPx = (widthInPercent / 100) * widthInPx;
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (Number.isNaN(widthInPx)) {
        widthInPx = width;
      }
    }
    return widthInPx;
  },

  /**
   * draw error bar mark
   * @param ctx canvas context
   * @param model bar base coords
   * @param plus positive error bar position
   * @param minus negative error bar position
   * @param color error bar stroke color
   * @param width error bar width in pixel
   * @param lineWidth error ber line width
   * @param horizontal orientation
   * @private
   */
  _drawErrorBar(ctx, model, plus, minus, color, lineWidth, width, horizontal) {
    ctx.save();
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    if (horizontal) {
      ctx.moveTo(minus, model.y - width / 2);
      ctx.lineTo(minus, model.y + width / 2);
      ctx.moveTo(minus, model.y);
      ctx.lineTo(plus, model.y);
      ctx.moveTo(plus, model.y - width / 2);
      ctx.lineTo(plus, model.y + width / 2);
    } else {
      ctx.moveTo(model.x - width / 2, plus);
      ctx.lineTo(model.x + width / 2, plus);
      ctx.moveTo(model.x, plus);
      ctx.lineTo(model.x, minus);
      ctx.moveTo(model.x - width / 2, minus);
      ctx.lineTo(model.x + width / 2, minus);
    }
    ctx.stroke();
    ctx.restore();
  },

  /**
   * resolve scale for current dataset from config and fallback to default scale
   * @param chart chartjs instance
   * @param horizontal orientation
   * @param i dataset index
   */
  _resolveScale(chart, horizontal, i) {
    const xAxisId = chart.data.datasets[i].xAxisID || 'x-axis-0';
    const yAxisId = chart.data.datasets[i].yAxisID || 'y-axis-0';
    const scaleId = horizontal ? xAxisId : yAxisId;
    return chart.scales[scaleId];
  },

  /**
   * plugin hook to draw the error bars
   * @param chart chartjs instance
   * @param easingValue animation function
   * @param options plugin options
   */
  afterDatasetsDraw(chart, easingValue, options) {
    // wait for easing value to reach 1 at the first render, after that draw immediately
    chart.__renderedOnce = chart.__renderedOnce || easingValue === 1;

    if (!chart.__renderedOnce) {
      return;
    }

    options = Object.assign({}, defaultOptions, options);

    // error bar and barchart bar coords
    const errorBarCoords = chart.data.datasets.map((d) => d.errorBars);
    const barchartCoords = this._getBarchartBaseCoords(chart);

    if (!barchartCoords || !barchartCoords[0] || !barchartCoords[0][0] || !errorBarCoords) {
      return;
    }

    // determine value scale and orientation (vertical or horizontal)
    const horizontal = this._isHorizontal(chart);

    const errorBarWidths = (Array.isArray(options.width) ? options.width : [options.width]).map((w) => this._computeWidth(chart, horizontal, w));
    const errorBarLineWidths = Array.isArray(options.lineWidth) ? options.lineWidth : [options.lineWidth];
    const errorBarColors = Array.isArray(options.color) ? options.color : [options.color];


    const ctx = chart.ctx;
    ctx.save();

    // map error bar to barchart bar via label property
    barchartCoords.forEach((dataset, i) => {
      const vScale = this._resolveScale(chart, horizontal, i);
      dataset.forEach((bar) => {


        let cur = errorBarCoords[i];
        if (!cur) {
          return;
        }
        const hasLabelProperty = Object.hasOwnProperty.call(cur, bar.label);
        let errorBarData = null;

        // common scale such as categorical
        if (hasLabelProperty) {
          errorBarData = cur[bar.label];
        } else if (!hasLabelProperty && bar.label && bar.label.label && Object.hasOwnProperty.call(cur, bar.label.label)) {
          // hierarchical scale has its label property nested in b.label object as b.label.label
          errorBarData = cur[bar.label.label];
        }

        if (!errorBarData) {
          return;
        }

        const errorBars = Array.isArray(errorBarData) ? errorBarData : [errorBarData];
        const value = vScale.getRightValue(bar.value);

        errorBars.forEach((errorBar, ei) => {
          // error bar data for the barchart bar or point in linechart
          const errorBarColor = errorBarColors[ei % errorBarColors.length] ? errorBarColors[ei % errorBarColors.length] : bar.color;
          const errorBarLineWidth = errorBarLineWidths[ei % errorBarLineWidths.length];
          const errorBarWidth = errorBarWidths[ei % errorBarWidths.length];

          const plusValue = options.absoluteValues ? errorBar.plus : (value + Math.abs(errorBar.plus));
          const minusValue = options.absoluteValues ? errorBar.minus : (value - Math.abs(errorBar.minus));

          const plus = vScale.getPixelForValue(plusValue);
          const minus = vScale.getPixelForValue(minusValue);

          this._drawErrorBar(ctx, bar, plus, minus, errorBarColor, errorBarLineWidth, errorBarWidth, horizontal);
        });
      });
    });

    ctx.restore();
  }
};

if (typeof Chart != "undefined")
    Chart.pluginService.register(ErrorBarsPlugin);

}


function compSimpleStats(num_data,name)
{
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

   var sorted = num_data.sort((x,y) => x-y);
   var p50 = sorted[Math.floor(num_data.length/2)];
   var p95 = sorted[Math.floor(num_data.length*0.95)];
   var p05 = sorted[Math.floor(num_data.length*0.05)];
   var order = Math.floor(Math.log10(sdev*2));

   var nanstr="</div> <div> #samples: " + num_data.length;
   if (nancnt >0)
	nanstr = nanstr + " nans/inf:"+nancnt;

   var obj = {mean:mean,sdev:sdev,n:num_data.length,name:name }
   var str = "<div> <div> " +  name 
   +" </div> <div> mean: "+fixNumberStr(mean,order)
   +" </div> <div> sdev: "+fixNumberStr(sdev,order) 
   +" </div> <div> p%(5,50,95): "+fixNumberStr(p05,order)+", "+fixNumberStr(p50,order)+", "+fixNumberStr(p95,order)
   +nanstr+"</div></div>"
   return {str:str,obj:obj};
}

function log10Str(x)
{
	if (x==0)
	    return 0;
	if (x>0.01 & x < 10) 
	    return x.toFixed(2)
	var l = Math.log10(x)
	if (x==0)
	   return "10<sup>-inf</sup>";
	var s = Math.floor(l)
	return (x/Math.pow(10,s)).toFixed(2) + "&middot;10<sup>"+s+"</sup>";
}


function fixNumberStr(x,order)
{
	if (isNaN(x) | x==0 | isNaN(order))
	    return x;
	if (0) //Math.abs(order) > 3)
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


KTableViewer.joinCSVs = function(t1,t2)
{
    var d1 = t1.getDataContent()
    var d2 = t2.getDataContent()

    var pid1
    var pidname;
    var ids1 = [];
    var pid2
    var ids2 = [];
    for (var k in d1.selections)
        if (d1.selections[k] == 2)
        {
            pid1 = k;
            pidname = d1.colnames[k]
        }
        else
            ids1.push(k)
    for (var k in d2.selections)
        if (d2.selections[k] == 2)
            pid2 = k;
        else
            ids2.push(k)

    if (pid1 == undefined | pid2 == undefined )
        return {err:"please specify in both tables the ID column (by yellow selection)"}
    if (ids1.length== 0 | ids2.length== 0)
        return {err:"please specify in both tables the columns you want to join with (green seletion)"}


    var join = {}

    for (var k = 0; k < d1.data.length;k++)
    {
    	var id = d1.data[k][pid1]   
    	if (id == "")
    	    continue;
    	var tmp = []; 	
    	for (var i = 0; i< ids1.length;i++)
    	    tmp.push(d1.data[k][ids1[i]])
    	if (join[id] == undefined)
    	    join[id] = [];
    	join[id].push(tmp);    	          
    }

    for (var k = 0; k < d2.data.length;k++)
    {
    	var id = d2.data[k][pid2]   
    	if (id == "")
    	    continue;
    	var tmp = []; 	
    	for (var i = 0; i< ids2.length;i++)
    	    tmp.push(d2.data[k][ids2[i]])
    	if (join[id] == undefined)
    	    join[id] = [Array(ids1.length).fill("")];
    	join[id] = join[id].map((x) => x.concat(tmp));    	          
    }

    var newcolnames = [];
    for (var k = 0; k < ids1.length;k++)
        newcolnames.push(d1.colnames[ids1[k]])
    for (var k = 0; k < ids2.length;k++)
        newcolnames.push(d2.colnames[ids2[k]])

    var csv = pidname + ";" +  newcolnames.join(";") + ";\n";
    for (var k in join)
    {
    	var rs = join[k];
    	for (var j = 0; j < rs.length;j++)
    	{
    		var jo = rs[j];
			if (jo.length < newcolnames.length)
				jo = jo.concat(Array(ids2.length).fill(""))
			csv += k + ";" + jo.join(";") + ";\n";
    	}
    }

    return {csv:csv};


}


KTableViewer.addTableFileObject = function(content,tobj,callback)
{
	function hashCode(str) {
	    let hash = 0;
	    for (let i = 0, len = str.length; i < len; i++) {
	        let chr = str.charCodeAt(i);
	        hash = (hash << 5) - hash + chr;
	        hash |= 0; // Convert to 32bit integer
	    }
	    return "DPXTOBJ"+hash;
	}
	function hashfun(dummy,str,cb)
		{
			var h = hashCode(str);
			cb(h)
		}
	hashfun("",JSON.stringify(tobj),function(fid) {
		var fileObject = {}
		fileObject.content = content;
		fileObject.contentType = "tab";
		fileObject.fileID = fid;
		tobj.fileID = fid;
		fileObject.fileinfo = {};        
		fileObject.modified = true;
		fileObject.filename = "GENTABLE.csv"
		if (tobj != undefined) 
		{
			if (tobj.name != undefined)
			    fileObject.filename = tobj.name;
			else if (tobj.fileselector != undefined)
		        fileObject.filename = "GENTABLE_"+tobj.fileselector.replace(/\.json/g,"").replace(/META\//g,"").replace(/[\ ]+/g,"_") + ".csv"
		}
		KViewer.dataManager.setFile(fileObject.fileID,fileObject);
		KViewer.cacheManager.update();		
		if (callback != undefined)
		    callback(fileObject);		
    });		

}




function pasteCSV()
{
	 var default_delim = ";"
	 if (pasteCSV.last_delim != undefined)
		 default_delim = pasteCSV.last_delim;
	 alertify.prompt([{msg:"Paste CSV/table below. Use as column delimiter:",addon:"<textarea id=KimportCSV> </textarea> "}, 
					  ], function(e,str)
	   { if (e)
		   {
			   var text = $("#KimportCSV").val();
			   pasteCSV.last_delim = str;
			   pasteCSV.lastContent = text;
			   popupView({content:text,contentType:"tab"},{intent:{singleview:true,delimiter:str}})				   
		   }
	   },[";"])

	var importEl = $("#KimportCSV");
	
	if (pasteCSV.lastContent != undefined)
		importEl.text(pasteCSV.lastContent)
	
	importEl[0].addEventListener("keyup", (event) => {
		event.stopPropagation();
	})
	
	importEl[0].addEventListener("paste", (event) => {

		var htmlindex = event.clipboardData.types.map((x) => x=="text/html").findIndex(x=>x)
		if (htmlindex == -1)
			return;
		else
		{
			event.preventDefault();
			event.stopPropagation();
			event.clipboardData.items[htmlindex].getAsString(function(str) {
				var $tmp = $(str).filter("table");	 
				importEl.val(pasteCSV.convert($tmp))
			 })			
		}
	},{capture:true});
}                 		

pasteCSV.convert = function($tmp)
{
	let csv_data = [];		 
	let rows = $tmp[0].getElementsByTagName('tr');
	for (let i = 0; i < rows.length; i++) {
		let cols = rows[i].querySelectorAll('td,th');		
		let csvrow = [];
		for (let j = 0; j < cols.length; j++) {
			csvrow.push(cols[j].textContent.replace(/[\n;]/g,""));
		}
		csv_data.push(csvrow.join(";"));
	}		 
	return csv_data.join('\n');
}

