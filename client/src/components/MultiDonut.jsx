import "./HalfDonut.css"

export default function MultiDonut({ data = [], title }) {
  // Add safety check
  if (!data || data.length === 0) {
    return <div className="multi-graph">{title}<div>No data available</div></div>;
  }
  
  return (
    <div className="multi-graph medium">
      {title}
      {data.map((item, index) => (
        <div 
          key={index}
          className="graph" 
          data-name={item.name}
          style={{
            '--percentage': item.percentage,
            '--fill': item.color
          }}
        />
      ))}
    </div>
  );
}