import "./HalfDonut.css"

export default function DonutKPI({ value, maxValue = 100 }) {
  const percentage = Math.min(100, (value / maxValue) * 100);
  
  const getColor = (val) => {
    if (val < 30) return "#f44336"; // Red
    if (val < 70) return "#ff9800"; // Orange  
    return "#4caf50"; // Green
  };

  return (
    <div 
      className="semi-donut-model medium" 
      style={{
        '--percentage': percentage,
        '--fill': getColor(percentage)
      }}
    >
      <span>{Math.round(percentage)}%</span>
      
    </div>
  );
}



